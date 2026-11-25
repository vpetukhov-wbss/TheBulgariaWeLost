import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { isUUID } from 'class-validator';
import { Connection, Model, mongo, type ClientSession } from 'mongoose';
import { createHash } from 'node:crypto';
import { uuidv7 } from 'uuidv7';
import { AuditTargetType } from '../back-office/audit-event.types';
import { Role } from '../auth/persistence/account.schema';
import type { SignedInAccount } from '../auth/strategies/jwt.strategy';
import { MaterialStatus } from '../publishing/persistence/material.schema';
import { PublishingAuditEvent } from '../publishing/persistence/publishing-event.schema';
import { PublishingService } from '../publishing/publishing.service';
import type {
  CreateModerationReportDto,
  DecideModerationCaseDto,
  ModerationCaseDetailDto,
  ModerationCasePageDto,
  ModerationCaseSummaryDto,
  ModerationReportPageDto,
} from './moderation.dto';
import {
  ModerationDecision,
  ModerationPriority,
  ModerationStatus,
  ModerationType,
  ReportReason,
  type Resolution,
} from './moderation.types';
import {
  ModerationCase,
  ModerationDecisionReceipt,
  ModerationReport,
} from './persistence/moderation.schema';

type Target = Awaited<ReturnType<PublishingService['moderationTarget']>>;
type Filters = {
  status?: ModerationStatus;
  priority?: ModerationPriority;
  caseType?: ModerationType;
};

function digest(values: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(values)).digest('hex');
}

function redactContacts(input?: string | null): string {
  return (
    input
      ?.trim()
      .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/gu, '[скрит имейл]')
      .replace(/(?:\+?\d[\d .()-]{7,}\d)/gu, '[скрит номер]') ?? ''
  );
}

function evidenceUrl(input?: string): string | undefined {
  if (!input) return undefined;
  try {
    const url = new URL(input);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    throw new BadRequestException({ code: 'evidence_url_invalid' });
  }
}

@Injectable()
export class ModerationService {
  constructor(
    @InjectModel(ModerationCase.name)
    private readonly cases: Model<ModerationCase>,
    @InjectModel(ModerationReport.name)
    private readonly reports: Model<ModerationReport>,
    @InjectModel(ModerationDecisionReceipt.name)
    private readonly receipts: Model<ModerationDecisionReceipt>,
    @InjectModel(PublishingAuditEvent.name)
    private readonly audit: Model<PublishingAuditEvent>,
    @InjectConnection() private readonly connection: Connection,
    private readonly publishing: PublishingService,
  ) {}

  static etag(record: ModerationCaseSummaryDto): string {
    return '"moderation-' + record.id + '-v' + record.version + '"';
  }

  static version(id: string, tag?: string): number {
    if (!tag) throw new HttpException({ code: 'precondition_required' }, 428);
    const prefix = '"moderation-' + id + '-v';
    const value =
      tag.startsWith(prefix) && tag.endsWith('"')
        ? tag.slice(prefix.length, -1)
        : '';
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
      throw new PreconditionFailedException({ code: 'version_conflict' });
    }
    return Number(value);
  }

  async report(
    slug: string,
    key: string | undefined,
    dto: CreateModerationReportDto,
  ): Promise<void> {
    const normalized = this.key(key);
    const requestHash = digest(['report', normalized]);
    const payloadHash = digest([
      normalized,
      slug,
      dto.reasonCode,
      dto.description ?? null,
      dto.evidenceUrl ?? null,
    ]);
    const existing = await this.reports.findOne({ requestHash }).exec();
    if (existing)
      return this.requireSamePayload(existing.payloadHash, payloadHash);
    const material = await this.publishing.publicBySlug(slug);
    const rights = [ReportReason.Copyright, ReportReason.Privacy].includes(
      dto.reasonCode,
    );
    const caseType = rights ? ModerationType.Rights : ModerationType.Content;
    const priority = rights
      ? ModerationPriority.High
      : ModerationPriority.Normal;
    const description =
      redactContacts(dto.description).slice(0, 1500) || undefined;
    const url = evidenceUrl(dto.evidenceUrl);
    const reportId = uuidv7();
    await this.transaction(async (session) => {
      const replay = await this.reports
        .findOne({ requestHash })
        .session(session)
        .exec();
      if (replay)
        return this.requireSamePayload(replay.payloadHash, payloadHash);
      const target = await this.publishing.moderationTarget(
        material.id,
        session,
      );
      if (
        !target.publicVisibility ||
        target.status !== MaterialStatus.Published
      ) {
        throw new NotFoundException({ code: 'material_not_found' });
      }
      const record = await this.cases
        .findOneAndUpdate(
          { targetId: material.id, caseType, active: true },
          {
            $setOnInsert: {
              _id: uuidv7(),
              title: material.content.title,
              status: ModerationStatus.Open,
              priority,
            },
            $inc: { reportCount: 1, version: 1 },
          },
          { upsert: true, new: true, session },
        )
        .exec();
      await this.reports.create(
        [
          {
            _id: reportId,
            caseId: record._id,
            requestHash,
            payloadHash,
            reasonCode: dto.reasonCode,
            description,
            evidenceUrl: url,
            revisionNumber: material.revisionNumber,
            createdAt: new Date(),
          },
        ],
        { session },
      );
    });
  }

  async list(filters: Filters): Promise<ModerationCasePageDto> {
    const query = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.priority ? { priority: filters.priority } : {}),
      ...(filters.caseType ? { caseType: filters.caseType } : {}),
    };
    const cases = await this.cases
      .find(query)
      .sort({ priority: 1, updatedAt: -1, _id: -1 })
      .limit(100)
      .exec();
    return { items: cases.map((record) => this.summary(record)) };
  }

  async get(
    principal: SignedInAccount,
    id: string,
  ): Promise<ModerationCaseDetailDto> {
    const record = await this.caseById(id);
    return this.detail(
      record,
      await this.publishing.moderationTarget(record.targetId),
      principal,
    );
  }

  async listReports(id: string): Promise<ModerationReportPageDto> {
    await this.caseById(id);
    const reports = await this.reports
      .find({ caseId: id })
      .sort({ createdAt: -1, _id: -1 })
      .limit(100)
      .exec();
    return {
      items: reports.map((report) => ({
        id: report._id,
        reasonCode: report.reasonCode,
        ...(report.description ? { description: report.description } : {}),
        ...(report.evidenceUrl ? { evidenceUrl: report.evidenceUrl } : {}),
        revisionNumber: report.revisionNumber,
        createdAtUtc: report.createdAt.toISOString(),
      })),
    };
  }

  async take(
    principal: SignedInAccount,
    id: string,
    priority: ModerationPriority,
    expected: number,
    correlationId: string,
  ): Promise<ModerationCaseDetailDto> {
    return this.transaction(async (session) => {
      const record = await this.caseById(id, session);
      if (record.version !== expected)
        throw new PreconditionFailedException({ code: 'version_conflict' });
      if (record.status === ModerationStatus.Resolved)
        throw new ConflictException({ code: 'moderation_case_resolved' });
      if (!this.mayManage(record, principal))
        throw new ForbiddenException({ code: 'moderation_case_assigned' });
      const next = await this.update(
        record,
        {
          status: ModerationStatus.UnderReview,
          assigneeId: record.assigneeId ?? principal.profile.id,
          priority,
        },
        session,
      );
      await this.record(
        next,
        principal,
        'ModerationCaseAssigned',
        correlationId,
        session,
        { priority },
      );
      return this.detail(
        next,
        await this.publishing.moderationTarget(next.targetId, session),
        principal,
      );
    });
  }

  async decide(
    principal: SignedInAccount,
    id: string,
    key: string | undefined,
    dto: DecideModerationCaseDto,
    correlationId: string,
  ): Promise<ModerationCaseDetailDto> {
    const receiptKey = digest([
      'decision',
      principal.profile.id,
      id,
      this.key(key),
    ]);
    const { decision, expectedVersion, targetExpectedVersion } = dto;
    const requestHash = digest([
      decision,
      expectedVersion,
      targetExpectedVersion ?? null,
      dto.reason,
    ]);
    const reason = redactContacts(dto.reason).slice(0, 500);
    if (reason.length < 3)
      throw new UnprocessableEntityException({ code: 'reason_required' });
    return this.transaction(async (session) => {
      const record = await this.caseById(id, session);
      const replay = await this.receipts
        .findById(receiptKey)
        .session(session)
        .exec();
      if (replay) {
        this.requireSamePayload(replay.requestHash, requestHash);
        return replay.response;
      }
      if (record.version !== expectedVersion)
        throw new ConflictException({ code: 'version_conflict' });
      const target = await this.publishing.moderationTarget(
        record.targetId,
        session,
      );
      if (
        !this.mayManage(record, principal) ||
        (decision === ModerationDecision.RestoreMaterial &&
          !this.mayRestore(record, principal))
      ) {
        throw new ForbiddenException({ code: 'moderation_decision_forbidden' });
      }
      if (!this.allowed(record, target, principal).includes(decision)) {
        throw new ConflictException({ code: 'invalid_moderation_decision' });
      }
      if (
        decision === ModerationDecision.RestoreMaterial &&
        (await this.cases
          .exists({
            targetId: target.id,
            caseType: ModerationType.Rights,
            active: true,
          })
          .session(session)
          .exec())
      ) {
        throw new ConflictException({ code: 'rights_review_pending' });
      }
      if (decision !== ModerationDecision.Dismiss) {
        if (!targetExpectedVersion)
          throw new UnprocessableEntityException({
            code: 'target_version_required',
          });
        await this.publishing.moderate(
          principal,
          target.id,
          id,
          decision,
          targetExpectedVersion,
          reason,
          correlationId,
          session,
        );
      }
      const resolution: Resolution = {
        decision,
        reason,
        decidedAtUtc: new Date().toISOString(),
      };
      const next = await this.update(
        record,
        {
          status: ModerationStatus.Resolved,
          active: false,
          resolution,
          ...(decision === ModerationDecision.WithdrawMaterial
            ? { withdrawal: resolution }
            : {}),
        },
        session,
      );
      await this.record(
        next,
        principal,
        'Moderation' + decision,
        correlationId,
        session,
        { targetId: target.id },
        reason,
      );
      const response = this.detail(
        next,
        await this.publishing.moderationTarget(target.id, session),
        principal,
      );
      await this.receipts.create([{ _id: receiptKey, requestHash, response }], {
        session,
      });
      return response;
    });
  }

  private mayManage(
    record: ModerationCase,
    principal: SignedInAccount,
  ): boolean {
    return (
      !record.assigneeId ||
      record.assigneeId === principal.profile.id ||
      principal.profile.role === Role.Administrator
    );
  }

  private mayRestore(
    record: ModerationCase,
    principal: SignedInAccount,
  ): boolean {
    return (
      record.caseType !== ModerationType.Rights ||
      principal.profile.role === Role.Administrator
    );
  }

  private allowed(
    record: ModerationCase,
    target: Target,
    principal: SignedInAccount,
  ): ModerationDecision[] {
    if (!this.mayManage(record, principal)) return [];
    if (record.status === ModerationStatus.UnderReview) {
      return target.publicVisibility &&
        target.status === MaterialStatus.Published
        ? [
            ModerationDecision.Dismiss,
            ModerationDecision.RequestCorrection,
            ModerationDecision.WithdrawMaterial,
          ]
        : [ModerationDecision.Dismiss];
    }
    return record.resolution?.decision ===
      ModerationDecision.WithdrawMaterial &&
      target.holdCaseId === record._id &&
      this.mayRestore(record, principal)
      ? [ModerationDecision.RestoreMaterial]
      : [];
  }

  private summary(record: ModerationCase): ModerationCaseSummaryDto {
    return {
      id: record._id,
      targetId: record.targetId,
      title: record.title,
      status: record.status,
      caseType: record.caseType,
      priority: record.priority,
      reportCount: record.reportCount,
      version: record.version,
      createdAtUtc: record.createdAt.toISOString(),
      updatedAtUtc: record.updatedAt.toISOString(),
      ...(record.assigneeId ? { assigneeId: record.assigneeId } : {}),
    };
  }

  private detail(
    record: ModerationCase,
    target: Target,
    principal: SignedInAccount,
  ): ModerationCaseDetailDto {
    return {
      ...this.summary(record),
      canTake:
        record.status !== ModerationStatus.Resolved &&
        this.mayManage(record, principal),
      target: {
        slug: target.slug,
        status: target.status,
        version: target.version,
        publicVisibility: target.publicVisibility,
      },
      allowedDecisions: this.allowed(record, target, principal),
      ...(record.resolution ? { resolution: record.resolution } : {}),
      ...(record.withdrawal ? { withdrawal: record.withdrawal } : {}),
    };
  }

  private async caseById(id: string, session?: ClientSession) {
    const query = this.cases.findById(id);
    if (session) query.session(session);
    const record = await query.exec();
    if (!record)
      throw new NotFoundException({ code: 'moderation_case_not_found' });
    return record;
  }

  private async update(
    record: ModerationCase,
    set: Partial<ModerationCase>,
    session: ClientSession,
  ) {
    const next = await this.cases
      .findOneAndUpdate(
        { _id: record._id, version: record.version },
        { $set: set, $inc: { version: 1 } },
        { new: true, session },
      )
      .exec();
    if (!next) throw new ConflictException({ code: 'version_conflict' });
    return next;
  }

  private async record(
    record: ModerationCase,
    principal: SignedInAccount,
    action: string,
    correlationId: string,
    session: ClientSession,
    metadata: Record<string, unknown>,
    reason?: string,
  ): Promise<void> {
    await this.audit.create(
      [
        {
          actorId: principal.profile.id,
          actorRole: principal.profile.role,
          targetType: AuditTargetType.Moderation,
          targetId: record._id,
          targetVersion: record.version,
          action,
          correlationId,
          metadata,
          reason,
          occurredAt: new Date(),
        },
      ],
      { session },
    );
  }

  private key(value?: string): string {
    if (!value || !isUUID(value, '4'))
      throw new BadRequestException({ code: 'idempotency_key_required' });
    return value.toLowerCase();
  }

  private requireSamePayload(existing: string, intended: string): void {
    if (existing !== intended)
      throw new ConflictException({ code: 'idempotency_key_reused' });
  }

  private async transaction<T>(
    action: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.connection.transaction(action);
      } catch (error: unknown) {
        if (!(error instanceof mongo.MongoServerError) || error.code !== 11000)
          throw error;
      }
    }
    throw new ConflictException({ code: 'request_in_progress' });
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, type ClientSession } from 'mongoose';
import { createHash } from 'node:crypto';
import type { SignedInAccount } from '../../auth/strategies/jwt.strategy';
import { AuditTargetType } from '../../back-office/audit-event.types';
import {
  PasswordResetOperation,
  ResetOperationStatus,
} from '../../back-office/persistence/password-reset-operation.schema';
import { PublishingAuditEvent } from '../../publishing/persistence/publishing-event.schema';
import { InspectionOutcome } from '../dto/media-upload.dto';
import {
  MediaUpload,
  ProcessingStatus,
  UploadStatus,
} from '../persistence/media-upload.schema';
import {
  JobStatus,
  JobType,
  type JobAttemptDto,
  type JobDetailDto,
  type OperationsAlertDto,
  type JobPageDto,
  type JobQueryDto,
  type JobRetryReceiptDto,
  type JobSummaryDto,
  type RetryJobDto,
} from './operations.dto';
import { operationsQuery } from './operations-query';
import { JobRetryCommand, MediaWorkerHeartbeat } from './operations.schema';

const mediaStatuses: Record<JobStatus, ProcessingStatus> = {
  [JobStatus.Queued]: ProcessingStatus.Pending,
  [JobStatus.Running]: ProcessingStatus.Claimed,
  [JobStatus.Succeeded]: ProcessingStatus.Ready,
  [JobStatus.Failed]: ProcessingStatus.Failed,
};
const retryable = new Set<string>([
  InspectionOutcome.Missing,
  InspectionOutcome.StorageUnavailable,
  InspectionOutcome.Timeout,
]);
const validOutcomes = new Set<string>(Object.values(InspectionOutcome));
const mediaType = { status: UploadStatus.Completed };
const ttl = 24 * 60 * 60_000;
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

@Injectable()
export class AdminJobsService {
  constructor(
    @InjectModel(MediaUpload.name) private readonly uploads: Model<MediaUpload>,
    @InjectModel(PasswordResetOperation.name)
    private readonly resets: Model<PasswordResetOperation>,
    @InjectModel(MediaWorkerHeartbeat.name)
    private readonly heartbeats: Model<MediaWorkerHeartbeat>,
    @InjectModel(JobRetryCommand.name)
    private readonly commands: Model<JobRetryCommand>,
    @InjectModel(PublishingAuditEvent.name)
    private readonly audit: Model<PublishingAuditEvent>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async list(query: JobQueryDto): Promise<JobPageDto> {
    const page = operationsQuery(query, [query.type, query.status]);
    const loadMedia = query.type !== JobType.PasswordResetEmail;
    const loadEmail = query.type !== JobType.MediaInspection;
    const [media, email] = await Promise.all([
      loadMedia
        ? this.uploads
            .find({
              ...mediaType,
              ...page.idFilter,
              ...page.dateFilter('completedAt'),
              ...(query.status
                ? {
                    ...(query.status === JobStatus.Queued
                      ? {
                          $or: [
                            { processingStatus: ProcessingStatus.Pending },
                            { processingStatus: { $exists: false } },
                          ],
                        }
                      : { processingStatus: mediaStatuses[query.status] }),
                  }
                : {}),
            })
            .sort({ _id: -1 })
            .limit(page.limit)
            .lean()
            .exec()
        : [],
      loadEmail
        ? this.resets
            .find({
              ...page.idFilter,
              ...page.dateFilter('requestedAt'),
              ...(query.status
                ? { status: ResetOperationStatus[query.status] }
                : {}),
            })
            .sort({ _id: -1 })
            .limit(page.limit)
            .lean()
            .exec()
        : [],
    ]);
    const items = [
      ...media.map((asset) => this.mediaSummary(asset)),
      ...email.map((reset) => this.emailSummary(reset)),
    ];
    items.sort((a, b) => b.id.localeCompare(a.id));
    return page.page(items);
  }

  async detail(id: string): Promise<JobDetailDto> {
    const asset = await this.uploads
      .findOne({ _id: id, ...mediaType })
      .lean()
      .exec();
    if (asset)
      return {
        ...this.mediaSummary(asset),
        targetId: id,
        attempts: this.attempts(asset),
        ...(asset.inspectionRetryTraceId
          ? { lastRetryTraceId: asset.inspectionRetryTraceId }
          : {}),
      };
    const reset = await this.resets.findById(id).lean().exec();
    if (!reset) throw new NotFoundException({ code: 'job_not_found' });
    return {
      ...this.emailSummary(reset),
      targetId: reset.targetId,
      attempts: reset.startedAt
        ? [
            {
              id,
              startedAtUtc: reset.startedAt.toISOString(),
              ...(reset.finishedAt
                ? {
                    finishedAtUtc: reset.finishedAt.toISOString(),
                    outcome: reset.status,
                  }
                : {}),
            },
          ]
        : [],
    };
  }

  async retry(
    id: string,
    key: string | undefined,
    dto: RetryJobDto,
    actor: SignedInAccount,
    traceId: string,
  ): Promise<JobRetryReceiptDto> {
    if (!key || !/^[a-zA-Z0-9_-]{8,128}$/u.test(key)) {
      throw new BadRequestException({ code: 'idempotency_key_invalid' });
    }
    const commandId = hash([actor.profile.id, id, key]);
    const requestHash = hash([dto.expectedVersion, dto.reason]);
    const result = { operationId: id, statusUrl: '/api/admin/v1/jobs/' + id };
    return this.connection.transaction(async (session) => {
      const prior = await this.commands
        .findById(commandId)
        .session(session)
        .lean()
        .exec();
      if (prior) {
        if (prior.requestHash !== requestHash)
          throw new ConflictException({ code: 'idempotency_key_reused' });
        return result;
      }

      const asset = await this.uploads
        .findOne({ _id: id, ...mediaType })
        .session(session)
        .lean()
        .exec();
      if (!asset) {
        if (await this.resets.exists({ _id: id }).session(session))
          throw new ConflictException({ code: 'job_retry_not_allowed' });
        throw new NotFoundException({ code: 'job_not_found' });
      }
      const summary = this.mediaSummary(asset);
      if (summary.version !== dto.expectedVersion)
        throw new ConflictException({ code: 'version_conflict' });
      if (!summary.canRetry)
        throw new ConflictException({ code: 'job_retry_not_allowed' });
      await this.queue(asset, summary, traceId, session);
      const now = new Date();
      await this.commands.create(
        [
          {
            _id: commandId,
            requestHash,
            expiresAt: new Date(now.getTime() + ttl),
          },
        ],
        { session },
      );
      await this.audit.create(
        [
          {
            actorId: actor.profile.id,
            actorRole: actor.profile.role,
            targetType: AuditTargetType.Job,
            targetId: id,
            targetVersion: summary.version + 1,
            action: 'MediaInspectionRetried',
            reason: dto.reason,
            correlationId: traceId,
            occurredAt: now,
          },
        ],
        { session },
      );
      return result;
    });
  }

  async telemetry() {
    const now = new Date();
    const [workers, mediaFailed, emailFailed, expired] = await Promise.all([
      this.heartbeats.find().sort({ lastSeenAt: -1 }).limit(100).lean().exec(),
      this.uploads
        .exists({ ...mediaType, processingStatus: ProcessingStatus.Failed })
        .exec(),
      this.resets
        .exists({
          status: ResetOperationStatus.Failed,
          finishedAt: { $gte: new Date(now.getTime() - ttl) },
        })
        .exec(),
      this.uploads
        .exists({
          ...mediaType,
          processingStatus: ProcessingStatus.Claimed,
          inspectionLeaseExpiresAt: { $lte: now },
        })
        .exec(),
    ]);
    const alerts: OperationsAlertDto[] = [
      ...(mediaFailed
        ? [{ code: 'job_failed', target: JobType.MediaInspection }]
        : []),
      ...(emailFailed
        ? [{ code: 'job_failed', target: JobType.PasswordResetEmail }]
        : []),
      ...(expired
        ? [{ code: 'job_lease_expired', target: JobType.MediaInspection }]
        : []),
    ];
    return {
      workers: workers.map((worker) => ({
        id: worker._id,
        lastSeenAtUtc: worker.lastSeenAt.toISOString(),
        online: worker.lastSeenAt.getTime() >= now.getTime() - 120_000,
      })),
      alerts,
    };
  }

  private async queue(
    asset: MediaUpload,
    job: JobSummaryDto,
    traceId: string,
    session: ClientSession,
  ) {
    const recorded = asset.inspectionAttempts ?? [];
    const legacyAttempt = asset.inspectionCompletedAttemptId;
    const history =
      legacyAttempt &&
      asset.inspectedAt &&
      !recorded.some((attempt) => attempt.id === legacyAttempt)
        ? [
            {
              id: legacyAttempt,
              finishedAt: asset.inspectedAt,
              outcome: asset.inspectionOutcome,
            },
            ...recorded,
          ]
        : recorded;
    const changed = await this.uploads
      .updateOne(
        {
          _id: asset._id,
          processingStatus: ProcessingStatus.Failed,
          inspectionVersion: asset.inspectionVersion ?? { $exists: false },
        },
        {
          $set: {
            processingStatus: ProcessingStatus.Pending,
            inspectionVersion: job.version + 1,
            inspectionAttemptCount: job.attemptCount,
            inspectionUpdatedAt: new Date(),
            inspectionRetryTraceId: traceId,
            inspectionAttempts: history.slice(-25),
          },
          $unset: {
            inspectionCompletedAttemptId: 1,
            inspectionOutcome: 1,
            inspectedAt: 1,
          },
        },
        { session },
      )
      .exec();
    if (!changed.matchedCount)
      throw new ConflictException({ code: 'version_conflict' });
  }

  private mediaSummary(asset: MediaUpload): JobSummaryDto {
    const status =
      asset.processingStatus === ProcessingStatus.Failed
        ? JobStatus.Failed
        : asset.processingStatus === ProcessingStatus.Ready
          ? JobStatus.Succeeded
          : asset.processingStatus === ProcessingStatus.Claimed
            ? JobStatus.Running
            : JobStatus.Queued;
    const outcome = asset.inspectionOutcome ?? '';
    return {
      id: asset._id,
      type: JobType.MediaInspection,
      status,
      attemptCount:
        asset.inspectionAttemptCount ??
        (asset.inspectionCompletedAttemptId || asset.inspectionAttemptId
          ? 1
          : 0),
      version: asset.inspectionVersion ?? 1,
      updatedAtUtc: (
        asset.inspectionUpdatedAt ??
        asset.inspectedAt ??
        asset.completedAt ??
        asset.updatedAt
      ).toISOString(),
      traceId: asset.correlationId,
      canRetry: status === JobStatus.Failed && retryable.has(outcome),
      ...(status === JobStatus.Failed
        ? {
            lastErrorCode: validOutcomes.has(outcome)
              ? outcome
              : 'inspection_failed',
          }
        : {}),
    };
  }

  private attempts(asset: MediaUpload): JobAttemptDto[] {
    const attempts = (asset.inspectionAttempts ?? []).map((attempt) => ({
      id: attempt.id,
      workerId: attempt.workerId,
      startedAtUtc: attempt.startedAt?.toISOString(),
      finishedAtUtc: attempt.finishedAt?.toISOString(),
      outcome: attempt.outcome,
    }));
    if (!attempts.length && asset.inspectionCompletedAttemptId) {
      return [
        {
          id: asset.inspectionCompletedAttemptId,
          finishedAtUtc: asset.inspectedAt?.toISOString(),
          outcome: asset.inspectionOutcome,
        },
      ];
    }
    return attempts.reverse();
  }

  private emailSummary(reset: PasswordResetOperation): JobSummaryDto {
    const status = JobStatus[reset.status];
    return {
      id: reset._id,
      type: JobType.PasswordResetEmail,
      status,
      version:
        status === JobStatus.Queued ? 1 : status === JobStatus.Running ? 2 : 3,
      attemptCount: reset.startedAt ? 1 : 0,
      updatedAtUtc: (
        reset.finishedAt ??
        reset.startedAt ??
        reset.requestedAt
      ).toISOString(),
      traceId: reset.traceId,
      canRetry: false,
      ...(status === JobStatus.Failed
        ? { lastErrorCode: 'password_reset_email_failed' }
        : {}),
    };
  }
}

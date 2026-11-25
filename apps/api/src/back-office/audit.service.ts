import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { isUUID } from 'class-validator';
import { Model } from 'mongoose';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Role } from '../auth/persistence/account.schema';
import type { AllConfigType } from '../config/config.type';
import { PublishingAuditEvent } from '../publishing/persistence/publishing-event.schema';
import { AuditOutcome, AuditTargetType } from './audit-event.types';
import type {
  AuditChangeDto,
  AuditEventDetailDto,
  AuditEventPageDto,
  AuditEventSummaryDto,
  AuditQueryDto,
} from './audit.dto';
import { AuditAccessEvent } from './persistence/audit-access-event.schema';

const summaryFields =
  '_id occurredAt actorId actorRole action targetType targetId outcome';
const credentialLabel =
  /(?:\b(?:password|passphrase|access[ _-]?token|refresh[ _-]?token|token|secret|api[ _-]?key|authorization)\b|парола|токен)\s*[:=]/iu;

// Reasons are operator-written text. Keep useful context while masking common sensitive values.
function redactReason(reason: string): string {
  if (credentialLabel.test(reason)) return '[скрито съдържание]';
  return reason
    .replace(/https?:\/\/[^\s<>]+/giu, '[връзка]')
    .replace(
      /[\p{L}\d.!#$%&'*+/=?^_`{|}~-]+@[\p{L}\d.-]+\.[\p{L}]{2,}/gu,
      '[имейл]',
    )
    .replace(/\bBearer\s+\S+/giu, '[токен]')
    .replace(
      /\b[A-Za-z\d_-]{12,}\.[A-Za-z\d_-]{10,}\.[A-Za-z\d_-]{10,}\b/gu,
      '[токен]',
    )
    .replace(/\b[A-Za-z\d_+/=-]{32,}\b/gu, '[код]')
    .replace(/(?<!\d)(?:\+?\d[ .()-]?){8,15}(?!\d)/gu, '[номер]')
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ');
}

function allowedChanges(metadata: Record<string, unknown>): AuditChangeDto[] {
  const changes: AuditChangeDto[] = [];
  for (const field of ['previousRole', 'role']) {
    const value = metadata[field];
    if (Object.values(Role).some((role) => role === value)) {
      changes.push({ field, value: String(value) });
    }
  }
  for (const field of [
    'sanctionId',
    'moderationCaseId',
    'sourceId',
    'targetId',
  ]) {
    const value = metadata[field];
    if (typeof value === 'string' && isUUID(value))
      changes.push({ field, value });
  }
  if (metadata.priority === 'Normal' || metadata.priority === 'High') {
    changes.push({ field: 'priority', value: metadata.priority });
  }
  const modifiedFields = metadata.fields;
  if (Array.isArray(modifiedFields)) {
    const fields = ['displayName', 'bio'].filter((field) =>
      modifiedFields.includes(field),
    );
    if (fields.length)
      changes.push({ field: 'fields', value: fields.join(', ') });
  }
  return changes;
}

type AuditFilters = Omit<
  AuditQueryDto,
  'cursor' | 'limit' | 'fromUtc' | 'toUtc'
> & {
  fromUtc?: Date;
  toUtc?: Date;
};

@Injectable()
export class AuditService {
  constructor(
    @InjectModel(PublishingAuditEvent.name)
    private readonly events: Model<PublishingAuditEvent>,
    @InjectModel(AuditAccessEvent.name)
    private readonly access: Model<AuditAccessEvent>,
    private readonly config: ConfigService<AllConfigType>,
  ) {}

  async list(
    query: AuditQueryDto,
    actorId: string,
    traceId: string,
  ): Promise<AuditEventPageDto> {
    const limit = query.limit ?? 25;
    const fromUtc = query.fromUtc ? new Date(query.fromUtc) : undefined;
    const toUtc = query.toUtc ? new Date(query.toUtc) : undefined;
    if (fromUtc && toUtc && fromUtc >= toUtc) {
      throw new BadRequestException({ code: 'invalid_date_range' });
    }
    const fields = {
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.targetId ? { targetId: query.targetId } : {}),
      ...(query.outcome ? { outcome: query.outcome } : {}),
    };
    const filters = { ...fields, fromUtc, toUtc };
    const after = query.cursor
      ? this.readCursor(query.cursor, filters)
      : undefined;
    const records = await this.events
      .find({
        ...fields,
        ...(fromUtc || toUtc
          ? {
              occurredAt: {
                ...(fromUtc ? { $gte: fromUtc } : {}),
                ...(toUtc ? { $lt: toUtc } : {}),
              },
            }
          : {}),
        ...(after
          ? {
              $or: [
                { occurredAt: { $lt: after.time } },
                { occurredAt: after.time, _id: { $lt: after.id } },
              ],
            }
          : {}),
      })
      .select(summaryFields)
      .sort({ occurredAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean()
      .exec();

    await this.access.create({
      actorId,
      traceId,
      action: 'Listed',
      occurredAt: new Date(),
    });
    return {
      items: records.slice(0, limit).map((record) => this.summary(record)),
      ...(records.length > limit
        ? {
            nextCursor: this.cursor(
              records[limit - 1].occurredAt,
              records[limit - 1]._id,
              filters,
            ),
          }
        : {}),
    };
  }

  async detail(
    id: string,
    actorId: string,
    traceId: string,
  ): Promise<AuditEventDetailDto> {
    const record = await this.events
      .findById(id)
      .select(summaryFields + ' reason metadata correlationId')
      .lean()
      .exec();
    if (!record) throw new NotFoundException({ code: 'audit_event_not_found' });
    const metadata = record.metadata ?? {};
    const changeSummary = allowedChanges(metadata);
    const operation = metadata.operationId;
    await this.access.create({
      actorId,
      traceId,
      action: 'Viewed',
      auditEventId: id,
      occurredAt: new Date(),
    });
    return {
      ...this.summary(record),
      traceId: record.correlationId,
      ...(record.reason ? { reason: redactReason(record.reason) } : {}),
      ...(changeSummary.length ? { changeSummary } : {}),
      ...(typeof operation === 'string' && isUUID(operation)
        ? { operationId: operation }
        : {}),
    };
  }

  private summary(
    record: Pick<
      PublishingAuditEvent,
      | '_id'
      | 'occurredAt'
      | 'actorId'
      | 'actorRole'
      | 'action'
      | 'targetType'
      | 'targetId'
      | 'outcome'
    >,
  ): AuditEventSummaryDto {
    return {
      id: record._id,
      occurredAtUtc: record.occurredAt.toISOString(),
      actorId: record.actorId,
      ...(record.actorRole ? { actorRole: record.actorRole } : {}),
      action: record.action,
      targetType: record.targetType ?? AuditTargetType.Other,
      outcome: record.outcome ?? AuditOutcome.Succeeded,
      targetId: record.targetId,
    };
  }

  private cursor(time: Date, id: string, filters: AuditFilters): string {
    const payload = time.getTime() + '.' + id;
    const key = this.config.getOrThrow('auth.secret', { infer: true });
    const signature = createHmac('sha256', key)
      .update(JSON.stringify(['audit-events', payload, filters]))
      .digest('base64url');
    return payload + '.' + signature;
  }

  private readCursor(
    value: string,
    filters: AuditFilters,
  ): { time: Date; id: string } {
    const [epochMs, id] = value.split('.');
    const time = new Date(Number(epochMs));
    if (
      !/^\d{1,15}$/.test(epochMs) ||
      Number.isNaN(time.getTime()) ||
      !isUUID(id, '7')
    ) {
      throw new BadRequestException({ code: 'invalid_cursor' });
    }
    const actual = Buffer.from(value);
    const expected = Buffer.from(this.cursor(time, id, filters));
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      throw new BadRequestException({ code: 'invalid_cursor' });
    }
    return { time, id };
  }
}

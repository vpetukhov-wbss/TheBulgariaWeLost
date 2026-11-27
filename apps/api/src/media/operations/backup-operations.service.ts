import {
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, mongo } from 'mongoose';
import type {
  BackupHealthDto,
  BackupPageDto,
  BackupQueryDto,
  BackupReportDto,
  BackupRunDto,
} from './operations.dto';
import { operationsQuery } from './operations-query';
import { BackupRun, BackupScope, BackupStatus } from './operations.schema';

type Report = Omit<BackupRun, '_id' | 'traceId' | 'version'>;

function readTime(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const instant = new Date(value);
  if (
    !/T.*(?:Z|[+-]\d{2}:?\d{2})$/u.test(value) ||
    !Number.isFinite(instant.getTime()) ||
    instant.getTime() > Date.now() + 300_000
  ) {
    throw new UnprocessableEntityException({ code: 'invalid_backup_time' });
  }
  return instant;
}

@Injectable()
export class BackupOperationsService {
  constructor(
    @InjectModel(BackupRun.name) private readonly runs: Model<BackupRun>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async list(query: BackupQueryDto): Promise<BackupPageDto> {
    const page = operationsQuery(query, [query.scope, query.status]);
    const items = await this.runs
      .find({
        ...page.idFilter,
        ...page.dateFilter('startedAt'),
        ...(query.scope ? { scope: query.scope } : {}),
        ...(query.status ? { status: query.status } : {}),
      })
      .sort({ _id: -1 })
      .limit(page.limit)
      .lean()
      .exec();
    return page.page(items.map((run) => this.present(run)));
  }

  async health(
    scope: BackupScope,
    storageLocationId?: string,
  ): Promise<BackupHealthDto> {
    const [latest] = await this.runs
      .aggregate<
        Pick<BackupRun, 'finishedAt' | 'verifiedAt' | 'restoreTestedAt'>
      >([
        {
          $match: {
            scope,
            ...(storageLocationId ? { storageLocationId } : {}),
            status: BackupStatus.Succeeded,
          },
        },
        {
          $group: {
            _id: null,
            finishedAt: { $max: '$finishedAt' },
            verifiedAt: { $max: '$verifiedAt' },
            restoreTestedAt: { $max: '$restoreTestedAt' },
          },
        },
      ])
      .exec();
    return {
      scope,
      ...(storageLocationId ? { storageLocationId } : {}),
      ...(latest?.finishedAt
        ? { lastSuccessfulBackupAtUtc: latest.finishedAt.toISOString() }
        : {}),
      ...(latest?.verifiedAt
        ? { lastVerificationAtUtc: latest.verifiedAt.toISOString() }
        : {}),
      ...(latest?.restoreTestedAt
        ? { lastVerifiedRestoreAtUtc: latest.restoreTestedAt.toISOString() }
        : {}),
    };
  }

  async report(
    id: string,
    body: BackupReportDto,
    traceId: string,
  ): Promise<BackupRunDto> {
    const next = this.validate(body);
    const write = () =>
      this.connection.transaction(async (session) => {
        const existing = await this.runs
          .findById(id)
          .session(session)
          .lean()
          .exec();
        if (!existing) {
          const [created] = await this.runs.create(
            [{ ...next, _id: id, version: 1, traceId }],
            { session },
          );
          return this.present(created);
        }

        const updates = this.reconcile(existing, next);
        if (!Object.keys(updates).length) return this.present(existing);
        await this.runs
          .updateOne(
            { _id: id },
            { $set: updates, $inc: { version: 1 } },
            { session },
          )
          .exec();
        return this.present({ ...existing, ...updates });
      });

    try {
      return await write();
    } catch (error: unknown) {
      if (!(error instanceof mongo.MongoServerError) || error.code !== 11000)
        throw error;
      return write();
    }
  }

  private validate(body: BackupReportDto): Report {
    const startedAt = readTime(body.startedAtUtc);
    const finishedAt = readTime(body.finishedAtUtc);
    const verifiedAt = readTime(body.verifiedAtUtc);
    const restoreTestedAt = readTime(body.restoreTestedAtUtc);
    const terminal = body.status !== BackupStatus.Running;
    if (
      !startedAt ||
      (body.scope === BackupScope.SftpOriginals) !==
        Boolean(body.storageLocationId) ||
      Boolean(finishedAt) !== terminal ||
      (finishedAt && finishedAt < startedAt) ||
      ((verifiedAt || restoreTestedAt) &&
        body.status !== BackupStatus.Succeeded) ||
      (verifiedAt && (!finishedAt || verifiedAt < finishedAt)) ||
      (restoreTestedAt && (!finishedAt || restoreTestedAt < finishedAt))
    )
      throw new UnprocessableEntityException({ code: 'invalid_backup_report' });
    return {
      scope: body.scope,
      status: body.status,
      startedAt,
      ...(body.storageLocationId
        ? { storageLocationId: body.storageLocationId }
        : {}),
      ...(finishedAt ? { finishedAt } : {}),
      ...(verifiedAt ? { verifiedAt } : {}),
      ...(restoreTestedAt ? { restoreTestedAt } : {}),
    };
  }

  private reconcile(existing: BackupRun, next: Report): Partial<Report> {
    if (
      existing.scope !== next.scope ||
      existing.storageLocationId !== next.storageLocationId ||
      existing.startedAt.getTime() !== next.startedAt.getTime()
    ) {
      throw new ConflictException({ code: 'backup_report_conflict' });
    }

    // A delayed in-progress report cannot undo a completed run.
    if (next.status === BackupStatus.Running) return {};
    if (
      existing.status !== BackupStatus.Running &&
      (existing.status !== next.status ||
        existing.finishedAt?.getTime() !== next.finishedAt?.getTime())
    ) {
      throw new ConflictException({ code: 'backup_report_conflict' });
    }

    const updates: Partial<Report> =
      existing.status === BackupStatus.Running
        ? { status: next.status, finishedAt: next.finishedAt }
        : {};
    for (const field of ['verifiedAt', 'restoreTestedAt'] as const) {
      const time = next[field];
      if (time && time.getTime() > (existing[field]?.getTime() ?? 0))
        updates[field] = time;
    }
    return updates;
  }

  private present(run: BackupRun): BackupRunDto {
    return {
      id: run._id,
      scope: run.scope,
      status: run.status,
      traceId: run.traceId,
      startedAtUtc: run.startedAt.toISOString(),
      ...(run.storageLocationId
        ? { storageLocationId: run.storageLocationId }
        : {}),
      ...(run.finishedAt
        ? { finishedAtUtc: run.finishedAt.toISOString() }
        : {}),
      ...(run.verifiedAt
        ? { verifiedAtUtc: run.verifiedAt.toISOString() }
        : {}),
      ...(run.restoreTestedAt
        ? { restoreTestedAtUtc: run.restoreTestedAt.toISOString() }
        : {}),
    };
  }
}

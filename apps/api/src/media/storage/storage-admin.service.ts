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
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { isUUID } from 'class-validator';
import { Connection, Model, mongo, type ClientSession } from 'mongoose';
import { createHash } from 'node:crypto';
import { uuidv7 } from 'uuidv7';
import { AuthService } from '../../auth/auth.service';
import { Role } from '../../auth/persistence/account.schema';
import type { SignedInAccount } from '../../auth/strategies/jwt.strategy';
import {
  AuditOutcome,
  AuditTargetType,
} from '../../back-office/audit-event.types';
import { BackOfficeGuard } from '../../back-office/back-office.guard';
import type { AllConfigType } from '../../config/config.type';
import { PublishingAuditEvent } from '../../publishing/persistence/publishing-event.schema';
import { InspectionOutcome } from '../dto/media-upload.dto';
import { BackupOperationsService } from '../operations/backup-operations.service';
import { BackupScope } from '../operations/operations.schema';
import { MediaUpload, UploadStatus } from '../persistence/media-upload.schema';
import {
  StorageAssetIssueKind,
  StorageConnectionStatus,
  StorageLocationStatus,
  StorageTransition,
  type CreateStorageLocationDto,
  type EditStorageLocationDto,
  type StorageAssetIssuePageDto,
  type StorageAssetIssueQueryDto,
  type StorageConnectionProfilePageDto,
  type StorageHealthDto,
  type StorageLocationDetailDto,
  type StorageLocationPageDto,
  type StorageLocationQueryDto,
  type StorageLocationSummaryDto,
  type StoragePageQueryDto,
  type TransitionStorageLocationDto,
} from './storage.dto';
import { StorageProfileClient } from './storage-profile-client';
import {
  StorageCommand,
  StorageRouting,
  type StorageLocation,
} from './storage-routing.schema';

const routingId = 'media-uploads';
const initialLocationId = '019a9451-2b60-7000-8000-000000000902';
const probeMaxAgeMs = 15 * 60_000;
const receiptTtlMs = 24 * 60 * 60_000;
type Actor = SignedInAccount & { correlationId: string };
type Command = { _id: string; requestHash: string };

const isDuplicate = (error: unknown) =>
  error instanceof mongo.MongoServerError && error.code === 11000;

@Injectable()
export class StorageAdminService {
  constructor(
    @InjectModel(StorageRouting.name)
    private readonly routing: Model<StorageRouting>,
    @InjectModel(StorageCommand.name)
    private readonly commands: Model<StorageCommand>,
    @InjectModel(MediaUpload.name) private readonly uploads: Model<MediaUpload>,
    @InjectModel(PublishingAuditEvent.name)
    private readonly audit: Model<PublishingAuditEvent>,
    @InjectConnection() private readonly connection: Connection,
    private readonly config: ConfigService<AllConfigType>,
    private readonly profilesClient: StorageProfileClient,
    private readonly backups: BackupOperationsService,
    private readonly auth: AuthService,
    private readonly backOffice: BackOfficeGuard,
  ) {}

  async activeProfileId(session: ClientSession): Promise<string> {
    const routing = await this.routing
      .findById(routingId)
      .select('activeProfileId')
      .session(session)
      .lean()
      .exec();
    return routing?.activeProfileId ?? this.defaultProfile();
  }

  async list(query: StorageLocationQueryDto): Promise<StorageLocationPageDto> {
    const state = await this.read();
    const items = state.locations
      .filter((location) => !query.status || location.status === query.status)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((location) => this.summary(location));
    return this.page(items, query, query.status ?? '');
  }

  async profiles(
    query: StoragePageQueryDto,
  ): Promise<StorageConnectionProfilePageDto> {
    const items = (await this.profilesClient.list()).map((id) => ({
      id,
      label: id,
    }));
    return this.page(items, query, 'profiles');
  }

  async detail(id: string): Promise<StorageLocationDetailDto> {
    const state = await this.read();
    return this.present(this.find(state, id), state);
  }

  async monitoredLocations() {
    const state = await this.read();
    return state.locations
      .filter(
        (location) =>
          location.status === StorageLocationStatus.ActiveForNewWrites ||
          location.status === StorageLocationStatus.ReadOnly,
      )
      .map((location) => ({
        id: location.id,
        connectionStatus:
          location.probe?.status ?? StorageConnectionStatus.NotChecked,
        checkedAt: location.probe?.checkedAt,
      }));
  }

  async health(id: string): Promise<StorageHealthDto> {
    const location = this.find(await this.read(), id);
    const sizes =
      location.status === StorageLocationStatus.Archived
        ? []
        : await this.uploads
            .aggregate<{
              total: number;
            }>([
              {
                $match: {
                  storageLocationId: location.profileId,
                  status: UploadStatus.Completed,
                },
              },
              {
                $group: {
                  _id: null,
                  total: {
                    $sum: {
                      $add: ['$length', { $ifNull: ['$previewLength', 0] }],
                    },
                  },
                },
              },
            ])
            .exec();

    const backup = await this.backups.health(BackupScope.SftpOriginals, id);
    return {
      locationId: id,
      status: location.probe?.status ?? StorageConnectionStatus.NotChecked,
      checkedAtUtc: location.probe?.checkedAt.toISOString() ?? null,
      usedBytes: sizes[0]?.total ?? 0,
      capacityBytes: null,
      lastSuccessfulBackupAtUtc: backup.lastSuccessfulBackupAtUtc ?? null,
      lastVerifiedRestoreAtUtc: backup.lastVerifiedRestoreAtUtc ?? null,
    };
  }

  async issues(
    id: string,
    query: StorageAssetIssueQueryDto,
  ): Promise<StorageAssetIssuePageDto> {
    const location = this.find(await this.read(), id);
    const scope = id + ':' + (query.kind ?? '');
    const after = this.cursorId(query.cursor, scope);
    if (after && !isUUID(after, '7')) this.invalidCursor();
    if (location.status === StorageLocationStatus.Archived)
      return { items: [] };
    const expired = { status: UploadStatus.Expired };
    const missing = {
      status: UploadStatus.Completed,
      inspectionOutcome: InspectionOutcome.Missing,
    };
    const mismatch = {
      status: UploadStatus.Completed,
      inspectionOutcome: InspectionOutcome.IntegrityMismatch,
    };
    const predicates = {
      [StorageAssetIssueKind.FailedUpload]: expired,
      [StorageAssetIssueKind.Missing]: missing,
      [StorageAssetIssueKind.IntegrityMismatch]: mismatch,
    };
    const limit = query.limit ?? 25;
    const rows = await this.uploads
      .find({
        storageLocationId: location.profileId,
        ...(after ? { _id: { $gt: after } } : {}),
        $or: query.kind ? [predicates[query.kind]] : Object.values(predicates),
      })
      .sort({ _id: 1 })
      .limit(limit + 1)
      .lean()
      .exec();
    return {
      items: rows.slice(0, limit).map((row) => ({
        ...(row.status === UploadStatus.Completed ? { assetId: row._id } : {}),
        uploadId: row._id,
        kind:
          row.status === UploadStatus.Expired
            ? StorageAssetIssueKind.FailedUpload
            : row.inspectionOutcome === InspectionOutcome.Missing
              ? StorageAssetIssueKind.Missing
              : StorageAssetIssueKind.IntegrityMismatch,
        detectedAtUtc: (row.inspectedAt ?? row.updatedAt).toISOString(),
      })),
      ...(rows.length > limit
        ? { nextCursor: this.cursor(scope, rows[limit - 1]._id) }
        : {}),
    };
  }

  async create(
    actor: Actor,
    key: string | undefined,
    body: CreateStorageLocationDto,
  ): Promise<StorageLocationDetailDto> {
    const command = this.command(actor, 'create', key, [
      body.label,
      body.profileId,
    ]);
    const replay = await this.replay<StorageLocationDetailDto>(command);
    if (replay) return replay;
    await this.requireProfile(body.profileId);
    return this.execute(command, async (state, session) => {
      this.assertAvailableProfile(state, body.profileId);
      const location: StorageLocation = {
        id: uuidv7(),
        profileId: body.profileId,
        label: body.label,
        status: StorageLocationStatus.Draft,
        version: 1,
        updatedAt: new Date(),
      };
      state.locations.push(location);
      await this.save(state, session);
      await this.record(actor, location, 'StorageLocationCreated', session);
      return this.present(location, state);
    });
  }

  async edit(
    actor: Actor,
    id: string,
    ifMatch: string | undefined,
    body: EditStorageLocationDto,
  ): Promise<StorageLocationDetailDto> {
    if (!ifMatch)
      throw new HttpException({ code: 'precondition_required' }, 428);
    if (body.profileId) await this.requireProfile(body.profileId);
    return this.transact(async (state, session) => {
      const location = this.find(state, id);
      if (ifMatch !== this.etag(this.present(location, state))) {
        throw new PreconditionFailedException({ code: 'version_conflict' });
      }
      const profileId = body.profileId ?? location.profileId;
      const label = body.label ?? location.label;
      if (profileId === location.profileId && label === location.label)
        return this.present(location, state);
      if (
        location.status === StorageLocationStatus.Archived ||
        (profileId !== location.profileId &&
          location.status !== StorageLocationStatus.Draft)
      ) {
        throw new ConflictException({ code: 'storage_location_immutable' });
      }
      this.assertAvailableProfile(state, profileId, id);
      location.profileId = profileId;
      location.label = label;
      delete location.probe;
      this.touch(location);
      await this.save(state, session);
      await this.record(actor, location, 'StorageLocationUpdated', session);
      return this.present(location, state);
    });
  }

  async check(
    actor: Actor,
    id: string,
    key: string | undefined,
    version: number,
  ): Promise<StorageHealthDto> {
    const command = this.command(actor, id + ':probe', key, [version]);
    const replay = await this.replay<StorageHealthDto>(command);
    if (replay) return replay;
    const location = this.requireVersion(await this.read(), id, version);
    if (location.status === StorageLocationStatus.Archived) {
      throw new ConflictException({ code: 'storage_location_immutable' });
    }
    const lease = new Date(Date.now() + 60_000);
    try {
      await this.commands.create({ ...command, expiresAt: lease });
    } catch (error: unknown) {
      if (!isDuplicate(error)) throw error;
      const raced = await this.replay<StorageHealthDto>(command);
      if (raced) return raced;
      throw new ConflictException({ code: 'request_in_progress' });
    }

    try {
      const status = await this.profilesClient.probe(
        location.profileId,
        actor.correlationId,
      );
      const checkedAt = new Date();
      const account = await this.auth.activeSession(
        actor.sessionId,
        actor.profile.id,
      );
      if (account.profile.role !== Role.Administrator) {
        throw new ForbiddenException({ code: 'forbidden' });
      }
      this.backOffice.requireAccess(account);
      return await this.transact(async (state, session) => {
        const current = this.requireVersion(state, id, version);
        this.touch(current);
        current.probe = { status, checkedAt, version: current.version };
        await this.save(state, session);
        const result: StorageHealthDto = {
          locationId: id,
          status,
          checkedAtUtc: checkedAt.toISOString(),
          usedBytes: null,
          capacityBytes: null,
          lastSuccessfulBackupAtUtc: null,
          lastVerifiedRestoreAtUtc: null,
        };
        const saved = await this.commands
          .updateOne(
            { _id: command._id, expiresAt: lease },
            {
              $set: {
                response: result,
                expiresAt: new Date(Date.now() + receiptTtlMs),
              },
            },
            { session },
          )
          .exec();
        if (!saved.matchedCount)
          throw new ConflictException({ code: 'request_in_progress' });
        await this.record(
          actor,
          current,
          'StorageConnectionChecked',
          session,
          undefined,
          status === StorageConnectionStatus.Healthy
            ? AuditOutcome.Succeeded
            : status === StorageConnectionStatus.Denied
              ? AuditOutcome.Denied
              : AuditOutcome.Failed,
        );
        return result;
      });
    } catch (error) {
      await this.commands
        .deleteOne({ _id: command._id, expiresAt: lease })
        .exec();
      throw error;
    }
  }

  async transition(
    actor: Actor,
    id: string,
    key: string | undefined,
    body: TransitionStorageLocationDto,
  ): Promise<StorageLocationDetailDto> {
    const command = this.command(actor, id + ':transition', key, [
      body.action,
      body.expectedVersion,
      body.expectedRoutingVersion,
      body.reason,
    ]);
    return this.execute(command, async (state, session) => {
      const location = this.requireVersion(state, id, body.expectedVersion);
      const activating = body.action === StorageTransition.ActivateForNewWrites;
      if (activating) {
        if (body.expectedRoutingVersion !== state.routingVersion) {
          throw new ConflictException({ code: 'routing_version_conflict' });
        }
        if (!this.canActivate(location)) {
          throw new ConflictException({ code: 'storage_not_ready' });
        }
        const previous = state.locations.find(
          (item) => item.status === StorageLocationStatus.ActiveForNewWrites,
        );
        if (previous) {
          previous.status = StorageLocationStatus.ReadOnly;
          this.touch(previous);
        }
        location.status = StorageLocationStatus.ActiveForNewWrites;
        state.activeProfileId = location.profileId;
        state.routingVersion++;
      } else {
        if (
          location.status !== StorageLocationStatus.Draft ||
          (await this.uploads
            .exists({ storageLocationId: location.profileId })
            .session(session))
        ) {
          throw new ConflictException({ code: 'storage_location_in_use' });
        }
        location.status = StorageLocationStatus.Archived;
      }
      this.touch(location);
      await this.save(state, session);
      await this.record(
        actor,
        location,
        activating ? 'StorageRoutingChanged' : 'StorageDraftArchived',
        session,
        body.reason,
      );
      return this.present(location, state);
    });
  }

  etag(location: StorageLocationDetailDto): string {
    return (
      '"storage-' +
      location.id +
      '-v' +
      location.version +
      '-r' +
      location.routingVersion +
      '"'
    );
  }

  private async read(session?: ClientSession): Promise<StorageRouting> {
    const query = this.routing.findById(routingId).lean();
    if (session) query.session(session);
    return (await query.exec()) ?? this.initial();
  }

  private defaultProfile(): string {
    return this.config.getOrThrow('media.defaultStorageLocationId', {
      infer: true,
    });
  }

  private initial(): StorageRouting {
    const profileId = this.defaultProfile();
    return {
      _id: routingId,
      schemaVersion: 1,
      activeProfileId: profileId,
      routingVersion: 1,
      locations: [
        {
          id: initialLocationId,
          label: profileId,
          profileId,
          status: StorageLocationStatus.ActiveForNewWrites,
          version: 1,
          updatedAt: new Date(0),
        },
      ],
    };
  }

  private async transact<T>(
    change: (state: StorageRouting, session: ClientSession) => Promise<T>,
  ): Promise<T> {
    try {
      await this.routing
        .updateOne(
          { _id: routingId },
          { $setOnInsert: this.initial() },
          { upsert: true },
        )
        .exec();
    } catch (error) {
      if (!isDuplicate(error)) throw error;
    }
    return this.connection.transaction(async (session) =>
      change(await this.read(session), session),
    );
  }

  private async save(
    state: StorageRouting,
    session: ClientSession,
  ): Promise<void> {
    const { _id, ...values } = state;
    await this.routing.updateOne({ _id }, { $set: values }, { session }).exec();
  }

  private async requireProfile(id: string): Promise<void> {
    if (!(await this.profilesClient.list()).includes(id)) {
      throw new UnprocessableEntityException({
        code: 'storage_profile_unknown',
      });
    }
  }

  private assertAvailableProfile(
    state: StorageRouting,
    profileId: string,
    except?: string,
  ): void {
    if (
      state.locations.some(
        (location) =>
          location.id !== except &&
          location.profileId === profileId &&
          location.status !== StorageLocationStatus.Archived,
      )
    ) {
      throw new ConflictException({ code: 'storage_profile_in_use' });
    }
  }

  private find(state: StorageRouting, id: string): StorageLocation {
    const location = state.locations.find((item) => item.id === id);
    if (!location)
      throw new NotFoundException({ code: 'storage_location_not_found' });
    return location;
  }

  private requireVersion(
    state: StorageRouting,
    id: string,
    version: number,
  ): StorageLocation {
    const location = this.find(state, id);
    if (location.version !== version)
      throw new ConflictException({ code: 'version_conflict' });
    return location;
  }

  private touch(location: StorageLocation): void {
    location.version++;
    location.updatedAt = new Date();
  }

  private canActivate(location: StorageLocation): boolean {
    return (
      (location.status === StorageLocationStatus.Draft ||
        location.status === StorageLocationStatus.ReadOnly) &&
      location.probe?.status === StorageConnectionStatus.Healthy &&
      location.probe.version === location.version &&
      location.probe.checkedAt.getTime() > Date.now() - probeMaxAgeMs
    );
  }

  private summary(location: StorageLocation): StorageLocationSummaryDto {
    return {
      id: location.id,
      label: location.label,
      profileId: location.profileId,
      provider: 'Sftp',
      status: location.status,
      version: location.version,
      updatedAtUtc: location.updatedAt.toISOString(),
      connectionStatus:
        location.probe?.status ?? StorageConnectionStatus.NotChecked,
    };
  }

  private present(
    location: StorageLocation,
    state: StorageRouting,
  ): StorageLocationDetailDto {
    const transitions: StorageTransition[] = [];
    if (this.canActivate(location))
      transitions.push(StorageTransition.ActivateForNewWrites);
    if (location.status === StorageLocationStatus.Draft)
      transitions.push(StorageTransition.ArchiveDraft);
    return {
      ...this.summary(location),
      routingVersion: state.routingVersion,
      transitions,
    };
  }

  private async record(
    actor: Actor,
    location: StorageLocation,
    action: string,
    session: ClientSession,
    reason?: string,
    outcome = AuditOutcome.Succeeded,
  ): Promise<void> {
    await this.audit.create(
      [
        {
          actorId: actor.profile.id,
          actorRole: actor.profile.role,
          targetType: AuditTargetType.StorageLocation,
          targetId: location.id,
          targetVersion: location.version,
          action,
          reason,
          outcome,
          correlationId: actor.correlationId,
          occurredAt: new Date(),
        },
      ],
      { session },
    );
  }

  private command(
    actor: Actor,
    scope: string,
    key: string | undefined,
    inputs: unknown[],
  ): Command {
    if (!key || !/^[a-zA-Z0-9_-]{8,128}$/.test(key)) {
      throw new BadRequestException({ code: 'idempotency_key_invalid' });
    }
    const hash = (value: unknown) =>
      createHash('sha256').update(JSON.stringify(value)).digest('hex');
    return {
      _id: hash([actor.profile.id, scope, key]),
      requestHash: hash(inputs),
    };
  }

  private async replay<T extends object>(
    command: Command,
    session?: ClientSession,
  ): Promise<T | undefined> {
    const query = this.commands.findById(command._id).lean();
    if (session) query.session(session);
    const existing = await query.exec();
    if (!existing) return undefined;
    if (existing.requestHash !== command.requestHash) {
      throw new ConflictException({ code: 'idempotency_key_reused' });
    }
    if (!existing.response)
      throw new ConflictException({ code: 'request_in_progress' });
    return existing.response as T;
  }

  private async execute<T extends object>(
    command: Command,
    action: (state: StorageRouting, session: ClientSession) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.transact(async (state, session) => {
        const replay = await this.replay<T>(command, session);
        if (replay) return replay;
        const result = await action(state, session);
        await this.commands.create(
          [
            {
              ...command,
              response: result,
              expiresAt: new Date(Date.now() + receiptTtlMs),
            },
          ],
          { session },
        );
        return result;
      });
    } catch (error) {
      if (!isDuplicate(error)) throw error;
      const replay = await this.replay<T>(command);
      if (replay) return replay;
      throw error;
    }
  }

  private page<T extends { id: string }>(
    items: T[],
    query: StoragePageQueryDto,
    scope: string,
  ): { items: T[]; nextCursor?: string } {
    const after = this.cursorId(query.cursor, scope);
    const limit = query.limit ?? 25;
    const filtered = after
      ? items.filter((item) => item.id.localeCompare(after) > 0)
      : items;
    const page = filtered.slice(0, limit);
    return {
      items: page,
      ...(filtered.length > limit
        ? { nextCursor: this.cursor(scope, page[limit - 1].id) }
        : {}),
    };
  }

  private cursor(scope: string, id: string): string {
    return Buffer.from(scope + '\n' + id).toString('base64url');
  }

  private cursorId(
    value: string | undefined,
    scope: string,
  ): string | undefined {
    if (!value) return undefined;
    const [filter, id] = Buffer.from(value, 'base64url')
      .toString('utf8')
      .split('\n');
    if (filter !== scope || !id || this.cursor(scope, id) !== value)
      this.invalidCursor();
    return id;
  }

  private invalidCursor(): never {
    throw new BadRequestException({ code: 'invalid_cursor' });
  }
}

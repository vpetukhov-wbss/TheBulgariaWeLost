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
import { Connection, Model, mongo } from 'mongoose';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Role } from '../../auth/persistence/account.schema';
import type { SignedInAccount } from '../../auth/strategies/jwt.strategy';
import { AuditTargetType } from '../../back-office/audit-event.types';
import type { AllConfigType } from '../../config/config.type';
import { PublishingAuditEvent } from '../../publishing/persistence/publishing-event.schema';
import {
  MediaAccessStatus,
  MediaUpload,
  ProcessingStatus,
  UploadStatus,
} from '../persistence/media-upload.schema';
import {
  AdminMediaRightsStatus,
  AdminMediaType,
  MediaRestrictionAction,
  type AdminMediaDetailDto,
  type AdminMediaPageDto,
  type AdminMediaQueryDto,
  type AdminMediaSummaryDto,
  type ChangeMediaRestrictionDto,
  type EditAdminMediaDto,
  type MediaUsagesDto,
} from './admin-media.dto';
import { MediaAccessCommand } from './media-access-command.schema';
import { MediaLibraryScope } from './media-library-scope.service';

type Actor = SignedInAccount & { correlationId: string };
type GalleryFilters = Pick<
  AdminMediaQueryDto,
  'q' | 'accessStatus' | 'processingStatus' | 'type' | 'rightsStatus'
>;

const listing = {
  _id: 1,
  purpose: 1,
  contentType: 1,
  processingStatus: 1,
  accessStatus: 1,
  rightsEvidence: 1,
  alternativeText: 1,
  creditLine: 1,
  updatedAt: 1,
  completedAt: 1,
  createdAt: 1,
} as const;
const metadataFields = {
  creditLine: 'creditLine',
  accessibilityText: 'alternativeText',
  rightsEvidence: 'rightsEvidence',
} as const;

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

@Injectable()
export class AdminMediaService {
  constructor(
    @InjectModel(MediaUpload.name) private readonly uploads: Model<MediaUpload>,
    @InjectModel(PublishingAuditEvent.name)
    private readonly audit: Model<PublishingAuditEvent>,
    @InjectModel(MediaAccessCommand.name)
    private readonly commands: Model<MediaAccessCommand>,
    @InjectConnection() private readonly connection: Connection,
    private readonly scope: MediaLibraryScope,
    private readonly config: ConfigService<AllConfigType>,
  ) {}

  static etag(media: AdminMediaDetailDto): string {
    return '"admin-media-' + digest(media) + '"';
  }

  async list(
    viewer: SignedInAccount,
    query: AdminMediaQueryDto,
  ): Promise<AdminMediaPageDto> {
    const { q, accessStatus, processingStatus, type, rightsStatus } = query;
    const filters = {
      q: q || undefined,
      accessStatus,
      processingStatus,
      type,
      rightsStatus,
    };
    const limit = query.limit ?? 25;
    const after = query.cursor
      ? this.readCursor(query.cursor, viewer, filters)
      : undefined;
    const search = q
      ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      : undefined;
    const results = await this.uploads.aggregate<MediaUpload>([
      {
        $match: {
          status: UploadStatus.Completed,
          ...(after ? { _id: { $lt: after } } : {}),
          ...(accessStatus ? { accessStatus } : {}),
          ...(processingStatus ? { processingStatus } : {}),
          ...(rightsStatus
            ? {
                rightsEvidence:
                  rightsStatus === AdminMediaRightsStatus.Recorded
                    ? /\S/
                    : { $not: /\S/ },
              }
            : {}),
          ...(type
            ? {
                contentType:
                  type === AdminMediaType.Image
                    ? /^image\//
                    : type === AdminMediaType.Pdf
                      ? 'application/pdf'
                      : { $not: /^(image\/|application\/pdf$)/ },
              }
            : {}),
          ...(search
            ? {
                $or: [
                  ...(q && isUUID(q, '7') ? [{ _id: q.toLowerCase() }] : []),
                  { alternativeText: search },
                  { creditLine: search },
                ],
              }
            : {}),
        },
      },
      { $sort: { _id: -1 } },
      ...this.scope.galleryScope(viewer.profile),
      { $limit: limit + 1 },
      { $project: listing },
    ]);
    return {
      items: results.slice(0, limit).map((asset) => this.summary(asset)),
      ...(results.length > limit
        ? { nextCursor: this.cursor(results[limit - 1]._id, viewer, filters) }
        : {}),
    };
  }

  async detail(
    viewer: SignedInAccount,
    id: string,
  ): Promise<AdminMediaDetailDto> {
    return this.present(await this.visible(viewer, id), viewer);
  }

  async usages(viewer: SignedInAccount, id: string): Promise<MediaUsagesDto> {
    await this.visible(viewer, id);
    return this.scope.usages(id, viewer.profile);
  }

  async edit(
    actor: Actor,
    id: string,
    ifMatch: string | undefined,
    dto: EditAdminMediaDto,
  ): Promise<AdminMediaDetailDto> {
    if (!ifMatch)
      throw new HttpException({ code: 'precondition_required' }, 428);
    await this.visible(actor, id);
    return this.connection.transaction(async (session) => {
      const asset = await this.uploads
        .findOne({ _id: id, status: UploadStatus.Completed })
        .session(session)
        .exec();
      if (!asset) throw new NotFoundException({ code: 'media_not_found' });
      const current = this.present(asset, actor);
      if (!current.canEdit) throw new ForbiddenException({ code: 'forbidden' });
      if (ifMatch !== AdminMediaService.etag(current)) {
        throw new PreconditionFailedException({ code: 'version_conflict' });
      }
      const fields: string[] = [];
      for (const key of Object.keys(
        metadataFields,
      ) as (keyof typeof metadataFields)[]) {
        const value = dto[key];
        const field = metadataFields[key];
        if (value !== undefined && (value || undefined) !== asset[field]) {
          asset[field] = value || undefined;
          fields.push(key);
        }
      }
      if (!fields.length) return current;
      asset.accessVersion += 1;
      await asset.save({ session });
      await this.audit.create(
        [
          {
            actorId: actor.profile.id,
            actorRole: actor.profile.role,
            targetType: AuditTargetType.Media,
            targetId: id,
            targetVersion: asset.accessVersion,
            action: 'MediaMetadataUpdated',
            reason: dto.reason,
            metadata: { fields },
            correlationId: actor.correlationId,
            occurredAt: new Date(),
          },
        ],
        { session },
      );
      return this.present(asset, actor);
    });
  }

  async restrict(
    actor: Actor,
    id: string,
    key: string | undefined,
    dto: ChangeMediaRestrictionDto,
  ): Promise<AdminMediaDetailDto> {
    if (actor.profile.role !== Role.Administrator)
      throw new ForbiddenException({ code: 'forbidden' });
    if (!key || !isUUID(key, '4'))
      throw new BadRequestException({ code: 'idempotency_key_required' });
    const commandId = digest([actor.profile.id, key.toLowerCase()]);
    const requestHash = digest([
      id,
      dto.action,
      dto.expectedVersion,
      dto.reason,
    ]);
    try {
      return await this.connection.transaction(async (session) => {
        const asset = await this.uploads
          .findOne({ _id: id, status: UploadStatus.Completed })
          .session(session)
          .exec();
        if (!asset) throw new NotFoundException({ code: 'media_not_found' });
        const receipt = await this.commands
          .findById(commandId)
          .session(session)
          .lean()
          .exec();
        if (receipt) {
          return this.replay(receipt, requestHash);
        }
        if (dto.expectedVersion !== asset.accessVersion)
          throw new ConflictException({ code: 'version_conflict' });
        const current = this.present(asset, actor);
        if (current.restrictionAction !== dto.action) {
          throw new UnprocessableEntityException({
            code: 'media_restriction_transition_invalid',
          });
        }
        const previousStatus = asset.accessStatus;
        asset.accessStatus =
          dto.action === MediaRestrictionAction.Restrict
            ? MediaAccessStatus.Restricted
            : MediaAccessStatus.Active;
        asset.accessVersion += 1;
        await asset.save({ session });
        const occurredAt = new Date();
        const detail = this.present(asset, actor);
        await this.audit.create(
          [
            {
              actorId: actor.profile.id,
              actorRole: actor.profile.role,
              targetType: AuditTargetType.Media,
              targetId: id,
              targetVersion: asset.accessVersion,
              action:
                dto.action === MediaRestrictionAction.Restrict
                  ? 'MediaAccessRestricted'
                  : 'MediaRestrictionLifted',
              reason: dto.reason,
              metadata: { previousStatus, accessStatus: asset.accessStatus },
              correlationId: actor.correlationId,
              occurredAt,
            },
          ],
          { session },
        );
        await this.commands.create(
          [
            {
              _id: commandId,
              requestHash,
              detail,
              expiresAt: new Date(occurredAt.getTime() + 24 * 60 * 60_000),
            },
          ],
          { session },
        );
        return detail;
      });
    } catch (error: unknown) {
      if (
        error instanceof mongo.MongoServerError &&
        error.code === 11000 &&
        (error.keyValue as { _id?: string } | undefined)?._id === commandId
      ) {
        const receipt = await this.commands.findById(commandId).lean().exec();
        if (receipt) return this.replay(receipt, requestHash);
      }
      throw error;
    }
  }

  private replay(
    receipt: MediaAccessCommand,
    requestHash: string,
  ): AdminMediaDetailDto {
    if (receipt.requestHash !== requestHash) {
      throw new ConflictException({ code: 'idempotency_key_reused' });
    }
    return receipt.detail;
  }

  private async visible(
    viewer: SignedInAccount,
    id: string,
  ): Promise<MediaUpload> {
    const asset = await this.uploads
      .findOne({ _id: id, status: UploadStatus.Completed })
      .lean()
      .exec();
    if (!asset) throw new NotFoundException({ code: 'media_not_found' });
    await this.scope.requireVisible(asset, viewer.profile);
    return asset;
  }

  private summary(asset: MediaUpload): AdminMediaSummaryDto {
    const type = asset.contentType?.startsWith('image/')
      ? AdminMediaType.Image
      : asset.contentType === 'application/pdf'
        ? AdminMediaType.Pdf
        : AdminMediaType.Other;
    const stamp = asset.updatedAt ?? asset.completedAt ?? asset.createdAt;
    return {
      id: asset._id,
      purpose: asset.purpose,
      type,
      processingStatus: asset.processingStatus ?? ProcessingStatus.Pending,
      accessStatus: asset.accessStatus ?? MediaAccessStatus.Active,
      rightsStatus: asset.rightsEvidence?.trim()
        ? AdminMediaRightsStatus.Recorded
        : AdminMediaRightsStatus.Missing,
      ...(asset.alternativeText
        ? { accessibilityText: asset.alternativeText }
        : {}),
      ...(asset.creditLine ? { creditLine: asset.creditLine } : {}),
      updatedAtUtc: stamp.toISOString(),
    };
  }

  private present(
    asset: MediaUpload,
    viewer: SignedInAccount,
  ): AdminMediaDetailDto {
    const summary = this.summary(asset);
    const admin = viewer.profile.role === Role.Administrator;
    const readable =
      summary.processingStatus === ProcessingStatus.Ready &&
      summary.accessStatus === MediaAccessStatus.Active;
    const restrictionAction = !admin
      ? undefined
      : summary.accessStatus === MediaAccessStatus.Active
        ? MediaRestrictionAction.Restrict
        : summary.accessStatus === MediaAccessStatus.Restricted
          ? MediaRestrictionAction.LiftRestriction
          : undefined;
    return {
      ...summary,
      ...(asset.rightsEvidence ? { rightsEvidence: asset.rightsEvidence } : {}),
      ...(asset.contentType ? { contentType: asset.contentType } : {}),
      ...(asset.inspectionOutcome
        ? { inspectionOutcome: asset.inspectionOutcome }
        : {}),
      length: asset.length,
      previewAvailable: !!(
        readable &&
        asset.contentType &&
        asset.previewFileKey &&
        asset.previewStorageLocationId &&
        asset.previewLength &&
        asset.previewContentType
      ),
      publicationEligible:
        readable && summary.rightsStatus === AdminMediaRightsStatus.Recorded,
      version: asset.accessVersion,
      canEdit: admin || asset.accountId === viewer.profile.id,
      ...(restrictionAction ? { restrictionAction } : {}),
    };
  }

  private cursor(
    id: string,
    viewer: SignedInAccount,
    filters: GalleryFilters,
  ): string {
    const key = this.config.getOrThrow('auth.secret', { infer: true });
    const signature = createHmac('sha256', key)
      .update(
        JSON.stringify([
          'admin-media',
          id,
          viewer.profile.id,
          viewer.profile.role,
          filters,
        ]),
      )
      .digest('base64url');
    return id + '.' + signature;
  }

  private readCursor(
    value: string,
    viewer: SignedInAccount,
    filters: GalleryFilters,
  ): string {
    const [id] = value.split('.');
    const actual = Buffer.from(value);
    const expected = Buffer.from(this.cursor(id, viewer, filters));
    if (
      !isUUID(id, '7') ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      throw new BadRequestException({ code: 'invalid_cursor' });
    }
    return id;
  }
}

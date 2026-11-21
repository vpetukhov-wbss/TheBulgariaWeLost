import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { isUUID } from 'class-validator';
import { randomBytes } from 'node:crypto';
import { Connection, Model, mongo } from 'mongoose';
import { uuidv7 } from 'uuidv7';
import { AuthService } from '../auth/auth.service';
import type { AllConfigType } from '../config/config.type';
import type {
  AuthorizeReadRequestDto,
  CreateUploadDto,
  CreateReadGrantDto,
  InspectionLeaseDto,
  InspectionResultDto,
  MediaAssetDto,
  ReadDecisionDto,
  ReadGrantDto,
  UploadClaimDto,
  UploadReceiptDto,
  UploadSessionDto,
} from './dto/media-upload.dto';
import { InspectionOutcome, MediaVariant } from './dto/media-upload.dto';
import { MediaQuota } from './persistence/media-quota.schema';
import {
  MediaAccessStatus,
  MediaUpload,
  ProcessingStatus,
  UploadStatus,
} from './persistence/media-upload.schema';

interface UploadGrantClaims {
  purpose: 'media-upload';
  sub: string;
  sessionId: string;
  uploadId: string;
  usage: string;
  maxBytes: number;
  attemptVersion: number;
}

interface ReadGrantClaims {
  purpose: 'media-read';
  sub: string;
  sessionId: string;
  assetId: string;
  variant: MediaVariant;
  accessVersion: number;
}

@Injectable()
export class MediaService {
  constructor(
    @InjectModel(MediaUpload.name)
    private readonly uploads: Model<MediaUpload>,
    @InjectModel(MediaQuota.name)
    private readonly quotas: Model<MediaQuota>,
    @InjectConnection() private readonly connection: Connection,
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
    private readonly config: ConfigService<AllConfigType>,
  ) {}

  async createUpload(
    accountId: string,
    sessionId: string,
    correlationId: string,
    dto: CreateUploadDto,
  ): Promise<UploadSessionDto> {
    const maxUploadBytes = this.value('maxUploadBytes');
    const quotaBytes = this.value('accountQuotaBytes');
    if (dto.length > maxUploadBytes) {
      throw new PayloadTooLargeException({ code: 'upload_too_large' });
    }
    if (dto.length > quotaBytes) {
      throw new PayloadTooLargeException({ code: 'upload_quota_exceeded' });
    }

    const uploadId = uuidv7();
    const attemptVersion = 1;
    const now = new Date();
    const expiresSeconds = this.value('uploadGrantExpiresSeconds');
    const expiresAt = new Date(now.getTime() + expiresSeconds * 1_000);
    const fileKey = randomBytes(32).toString('hex');
    const storageLocationId = this.config.getOrThrow(
      'media.defaultStorageLocationId',
      { infer: true },
    );
    await this.ensureQuota(accountId, quotaBytes);

    const databaseSession = await this.connection.startSession();
    try {
      await databaseSession.withTransaction(async () => {
        await this.releaseExpiredReservations(accountId, now, databaseSession);
        await this.quotas.updateOne(
          { _id: accountId },
          { $set: { quotaBytes } },
          { session: databaseSession },
        );
        const reserved = await this.quotas
          .findOneAndUpdate(
            {
              _id: accountId,
              reservedBytes: { $lte: quotaBytes - dto.length },
            },
            { $inc: { reservedBytes: dto.length } },
            { new: true, session: databaseSession },
          )
          .exec();
        if (!reserved) {
          throw new PayloadTooLargeException({
            code: 'upload_quota_exceeded',
          });
        }
        await this.uploads.create(
          [
            {
              _id: uploadId,
              schemaVersion: 3,
              accountId,
              sessionId,
              correlationId,
              purpose: dto.purpose,
              length: dto.length,
              sha256: dto.sha256,
              ...(dto.alternativeText
                ? { alternativeText: dto.alternativeText }
                : {}),
              ...(dto.rightsEvidence
                ? { rightsEvidence: dto.rightsEvidence }
                : {}),
              storageLocationId,
              fileKey,
              status: UploadStatus.Pending,
              attemptVersion,
              expiresAt,
              quotaReserved: true,
            },
          ],
          { session: databaseSession },
        );
      });
    } finally {
      await databaseSession.endSession();
    }

    const grant = await this.jwt.signAsync(
      {
        purpose: 'media-upload',
        sub: accountId,
        sessionId,
        uploadId,
        usage: dto.purpose,
        maxBytes: dto.length,
        attemptVersion,
      } satisfies UploadGrantClaims,
      {
        secret: this.config.getOrThrow('media.uploadGrantSecret', {
          infer: true,
        }),
        algorithm: 'HS256',
        audience: 'media-upload',
        expiresIn: expiresSeconds,
      },
    );
    return {
      uploadId,
      uploadUrl: `/media/v1/uploads/${uploadId}`,
      grant,
      expiresAtUtc: expiresAt.toISOString(),
      maxBytes: dto.length,
      attemptVersion,
    };
  }

  async claimUpload(uploadId: string, grant: string): Promise<UploadClaimDto> {
    const claims = await this.verifyGrant(grant);
    if (claims.uploadId !== uploadId) this.invalidGrant();

    const upload = await this.uploads.findById(uploadId).exec();
    if (!upload) throw new NotFoundException({ code: 'upload_not_found' });
    if (!this.matchesGrant(upload, claims)) this.invalidGrant();
    await this.requireActiveSession(upload.accountId, upload.sessionId);

    const now = new Date();
    if (upload.expiresAt <= now) {
      throw new ForbiddenException({ code: 'upload_grant_expired' });
    }
    const attemptId = uuidv7();
    const leaseExpiresAt = new Date(
      now.getTime() + this.value('uploadLeaseSeconds') * 1_000,
    );
    const claimed = await this.uploads
      .findOneAndUpdate(
        {
          _id: uploadId,
          attemptVersion: claims.attemptVersion,
          expiresAt: { $gt: now },
          $or: [
            { status: UploadStatus.Pending },
            {
              status: UploadStatus.Claimed,
              leaseExpiresAt: { $lte: now },
            },
          ],
        },
        {
          $set: {
            status: UploadStatus.Claimed,
            activeAttemptId: attemptId,
            leaseExpiresAt,
          },
        },
        { new: true },
      )
      .exec();
    if (!claimed) {
      throw new ConflictException({ code: 'upload_already_claimed' });
    }
    return {
      attemptId,
      attemptVersion: claimed.attemptVersion,
      object: {
        storageLocationId: claimed.storageLocationId,
        fileKey: claimed.fileKey,
      },
      length: claimed.length,
      sha256: claimed.sha256,
    };
  }

  async completeUpload(
    uploadId: string,
    receipt: UploadReceiptDto,
  ): Promise<void> {
    const upload = await this.uploads.findById(uploadId).exec();
    if (!upload) throw new NotFoundException({ code: 'upload_not_found' });
    if (upload.status === UploadStatus.Completed) {
      if (this.sameReceipt(upload, receipt)) return;
      throw new ConflictException({ code: 'upload_completion_conflict' });
    }
    await this.requireActiveSession(upload.accountId, upload.sessionId);
    if (
      upload.activeAttemptId !== receipt.attemptId ||
      upload.status !== UploadStatus.Claimed
    ) {
      throw new ConflictException({ code: 'upload_attempt_mismatch' });
    }
    if (upload.length !== receipt.length || upload.sha256 !== receipt.sha256) {
      throw new UnprocessableEntityException({
        code: 'upload_integrity_mismatch',
      });
    }

    const completedAt = new Date();
    const completed = await this.uploads.updateOne(
      {
        _id: uploadId,
        status: UploadStatus.Claimed,
        activeAttemptId: receipt.attemptId,
        length: receipt.length,
        sha256: receipt.sha256,
      },
      {
        $set: {
          status: UploadStatus.Completed,
          completedAttemptId: receipt.attemptId,
          completedAt,
          contentType: receipt.contentType,
          processingStatus: ProcessingStatus.Pending,
          accessStatus: MediaAccessStatus.Active,
          accessVersion: upload.accessVersion || 1,
          schemaVersion: 3,
        },
        $unset: { activeAttemptId: 1, leaseExpiresAt: 1 },
      },
    );
    if (completed.modifiedCount) return;

    const concurrent = await this.uploads.findById(uploadId).exec();
    if (concurrent && this.sameReceipt(concurrent, receipt)) return;
    throw new ConflictException({ code: 'upload_completion_conflict' });
  }

  async getAsset(accountId: string, assetId: string): Promise<MediaAssetDto> {
    const asset = await this.uploads
      .findOne({ _id: assetId, accountId, status: UploadStatus.Completed })
      .exec();
    if (!asset) throw new NotFoundException({ code: 'media_not_found' });
    return {
      id: asset._id,
      processingStatus: asset.processingStatus ?? ProcessingStatus.Pending,
      ...(asset.contentType ? { contentType: asset.contentType } : {}),
      ...(asset.alternativeText
        ? { alternativeText: asset.alternativeText }
        : {}),
      ...(asset.rightsEvidence ? { rightsEvidence: asset.rightsEvidence } : {}),
      ...(asset.correlationId ? { correlationId: asset.correlationId } : {}),
      variants:
        asset.processingStatus === ProcessingStatus.Ready
          ? [MediaVariant.Original, MediaVariant.Preview]
          : [],
    };
  }

  async createReadGrant(
    accountId: string,
    sessionId: string,
    assetId: string,
    dto: CreateReadGrantDto,
  ): Promise<ReadGrantDto> {
    const asset = await this.uploads.findById(assetId).exec();
    if (!asset || asset.accountId !== accountId) {
      throw new NotFoundException({ code: 'media_not_found' });
    }
    this.requireReadable(asset, dto.variant);

    const expiresSeconds = this.value('readGrantExpiresSeconds');
    const expiresAt = new Date(Date.now() + expiresSeconds * 1_000);
    const grant = await this.jwt.signAsync(
      {
        purpose: 'media-read',
        sub: accountId,
        sessionId,
        assetId,
        variant: dto.variant,
        accessVersion: asset.accessVersion,
      } satisfies ReadGrantClaims,
      {
        secret: this.config.getOrThrow('media.readGrantSecret', {
          infer: true,
        }),
        algorithm: 'HS256',
        audience: 'media-read',
        expiresIn: expiresSeconds,
      },
    );
    return {
      assetId,
      variant: dto.variant,
      grant,
      url: `/media/v1/assets/${assetId}/${dto.variant}`,
      expiresAtUtc: expiresAt.toISOString(),
    };
  }

  async authorizeRead(
    assetId: string,
    dto: AuthorizeReadRequestDto,
  ): Promise<ReadDecisionDto> {
    const claims = await this.verifyReadGrant(dto.grant);
    if (claims.assetId !== assetId || claims.variant !== dto.variant) {
      this.invalidReadGrant();
    }
    const asset = await this.uploads.findById(assetId).exec();
    if (!asset) throw new NotFoundException({ code: 'media_not_found' });
    if (
      asset.accountId !== claims.sub ||
      asset.accessVersion !== claims.accessVersion
    ) {
      this.invalidReadGrant();
    }
    await this.requireActiveSession(
      asset.accountId,
      claims.sessionId,
      'media_session_revoked',
    );
    this.requireReadable(asset, dto.variant);
    return dto.variant === MediaVariant.Original
      ? {
          object: {
            storageLocationId: asset.storageLocationId,
            fileKey: asset.fileKey,
          },
          length: asset.length,
          contentType: asset.contentType as string,
        }
      : {
          object: {
            storageLocationId: asset.previewStorageLocationId as string,
            fileKey: asset.previewFileKey as string,
          },
          length: asset.previewLength as number,
          contentType: asset.previewContentType as string,
        };
  }

  async leaseInspection(): Promise<InspectionLeaseDto | null> {
    const now = new Date();
    const attemptId = uuidv7();
    const previewFileKey = randomBytes(32).toString('hex');
    const leaseExpiresAt = new Date(
      now.getTime() + this.value('inspectionLeaseSeconds') * 1_000,
    );
    const claimed = await this.uploads
      .findOneAndUpdate(
        {
          status: UploadStatus.Completed,
          $or: [
            { processingStatus: ProcessingStatus.Pending },
            {
              processingStatus: ProcessingStatus.Claimed,
              inspectionLeaseExpiresAt: { $lte: now },
            },
          ],
        },
        {
          $set: {
            processingStatus: ProcessingStatus.Claimed,
            inspectionAttemptId: attemptId,
            inspectionLeaseExpiresAt: leaseExpiresAt,
            inspectionPreviewFileKey: previewFileKey,
          },
        },
        { new: true, sort: { completedAt: 1 } },
      )
      .exec();
    if (!claimed) return null;
    return {
      jobId: claimed._id,
      attemptId,
      object: {
        storageLocationId: claimed.storageLocationId,
        fileKey: claimed.fileKey,
      },
      previewObject: {
        storageLocationId: claimed.storageLocationId,
        fileKey: previewFileKey,
      },
      length: claimed.length,
      sha256: claimed.sha256,
    };
  }

  async completeInspection(
    jobId: string,
    result: InspectionResultDto,
  ): Promise<void> {
    const asset = await this.uploads.findById(jobId).exec();
    if (!asset) throw new NotFoundException({ code: 'media_not_found' });
    if (
      asset.processingStatus === ProcessingStatus.Ready ||
      asset.processingStatus === ProcessingStatus.Failed
    ) {
      if (this.sameInspectionResult(asset, result)) return;
      throw new ConflictException({ code: 'inspection_completion_conflict' });
    }
    if (
      asset.processingStatus !== ProcessingStatus.Claimed ||
      asset.inspectionAttemptId !== result.attemptId
    ) {
      throw new ConflictException({ code: 'inspection_attempt_mismatch' });
    }
    this.validateInspectionResult(asset, result);

    const inspected = result.outcome === InspectionOutcome.Inspected;
    const completedAt = new Date();
    const set: Record<string, unknown> = {
      processingStatus: inspected
        ? ProcessingStatus.Ready
        : ProcessingStatus.Failed,
      inspectionCompletedAttemptId: result.attemptId,
      inspectionOutcome: result.outcome,
      inspectedAt: completedAt,
    };
    if (inspected) {
      set.previewStorageLocationId = result.previewObject?.storageLocationId;
      set.previewFileKey = result.previewObject?.fileKey;
      set.previewLength = result.previewLength;
      set.previewSha256 = result.previewSha256;
      set.previewContentType = result.previewContentType;
    }
    const completed = await this.uploads.updateOne(
      {
        _id: jobId,
        processingStatus: ProcessingStatus.Claimed,
        inspectionAttemptId: result.attemptId,
      },
      {
        $set: set,
        $unset: {
          inspectionAttemptId: 1,
          inspectionLeaseExpiresAt: 1,
          inspectionPreviewFileKey: 1,
        },
      },
    );
    if (completed.modifiedCount) return;

    const concurrent = await this.uploads.findById(jobId).exec();
    if (concurrent && this.sameInspectionResult(concurrent, result)) return;
    throw new ConflictException({ code: 'inspection_completion_conflict' });
  }

  private async releaseExpiredReservations(
    accountId: string,
    now: Date,
    session: mongo.ClientSession,
  ): Promise<void> {
    const expired = await this.uploads
      .find({
        accountId,
        quotaReserved: true,
        $or: [
          {
            status: UploadStatus.Pending,
            expiresAt: { $lte: now },
          },
          {
            status: UploadStatus.Claimed,
            expiresAt: { $lte: now },
            leaseExpiresAt: { $lte: now },
          },
        ],
      })
      .select('_id length')
      .session(session)
      .exec();
    if (!expired.length) return;
    const ids = expired.map((upload) => upload._id);
    const releasedBytes = expired.reduce(
      (total, upload) => total + upload.length,
      0,
    );
    const released = await this.uploads.updateMany(
      {
        _id: { $in: ids },
        quotaReserved: true,
        $or: [
          {
            status: UploadStatus.Pending,
            expiresAt: { $lte: now },
          },
          {
            status: UploadStatus.Claimed,
            expiresAt: { $lte: now },
            leaseExpiresAt: { $lte: now },
          },
        ],
      },
      {
        $set: { status: UploadStatus.Expired, quotaReserved: false },
        $unset: { activeAttemptId: 1, leaseExpiresAt: 1 },
      },
      { session },
    );
    if (released.modifiedCount === expired.length) {
      await this.quotas.updateOne(
        { _id: accountId },
        { $inc: { reservedBytes: -releasedBytes } },
        { session },
      );
    }
  }

  private async ensureQuota(
    accountId: string,
    quotaBytes: number,
  ): Promise<void> {
    try {
      await this.quotas.updateOne(
        { _id: accountId },
        {
          $setOnInsert: {
            schemaVersion: 1,
            reservedBytes: 0,
            quotaBytes,
          },
        },
        { upsert: true },
      );
    } catch (error: unknown) {
      if (!(error instanceof mongo.MongoServerError && error.code === 11000)) {
        throw error;
      }
    }
  }

  private async verifyGrant(grant: string): Promise<UploadGrantClaims> {
    try {
      const claims = await this.jwt.verifyAsync<UploadGrantClaims>(grant, {
        secret: this.config.getOrThrow('media.uploadGrantSecret', {
          infer: true,
        }),
        algorithms: ['HS256'],
        audience: 'media-upload',
      });
      if (
        claims.purpose !== 'media-upload' ||
        !isUUID(claims.sub, '7') ||
        !isUUID(claims.sessionId, '7') ||
        !isUUID(claims.uploadId, '7') ||
        !Number.isSafeInteger(claims.maxBytes) ||
        !Number.isSafeInteger(claims.attemptVersion)
      ) {
        this.invalidGrant();
      }
      return claims;
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) throw error;
      this.invalidGrant();
    }
  }

  private async verifyReadGrant(grant: string): Promise<ReadGrantClaims> {
    try {
      const claims = await this.jwt.verifyAsync<ReadGrantClaims>(grant, {
        secret: this.config.getOrThrow('media.readGrantSecret', {
          infer: true,
        }),
        algorithms: ['HS256'],
        audience: 'media-read',
      });
      if (
        claims.purpose !== 'media-read' ||
        !isUUID(claims.sub, '7') ||
        !isUUID(claims.sessionId, '7') ||
        !isUUID(claims.assetId, '7') ||
        !Object.values(MediaVariant).includes(claims.variant) ||
        !Number.isSafeInteger(claims.accessVersion)
      ) {
        this.invalidReadGrant();
      }
      return claims;
    } catch (error: unknown) {
      if (error instanceof ForbiddenException) throw error;
      this.invalidReadGrant();
    }
  }

  private matchesGrant(
    upload: MediaUpload,
    claims: UploadGrantClaims,
  ): boolean {
    return (
      upload.accountId === claims.sub &&
      upload.sessionId === claims.sessionId &&
      upload.purpose === claims.usage &&
      upload.length === claims.maxBytes &&
      upload.attemptVersion === claims.attemptVersion
    );
  }

  private async requireActiveSession(
    accountId: string,
    sessionId: string,
    code = 'upload_session_revoked',
  ): Promise<void> {
    try {
      await this.auth.activeSession(sessionId, accountId);
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        throw new ForbiddenException({ code });
      }
      throw error;
    }
  }

  private sameReceipt(upload: MediaUpload, receipt: UploadReceiptDto): boolean {
    return (
      upload.status === UploadStatus.Completed &&
      upload.completedAttemptId === receipt.attemptId &&
      upload.length === receipt.length &&
      upload.sha256 === receipt.sha256 &&
      upload.contentType === receipt.contentType
    );
  }

  private requireReadable(asset: MediaUpload, variant: MediaVariant): void {
    if (
      asset.status !== UploadStatus.Completed ||
      asset.processingStatus !== ProcessingStatus.Ready
    ) {
      throw new ConflictException({ code: 'media_processing_incomplete' });
    }
    if (asset.accessStatus !== MediaAccessStatus.Active) {
      throw new ForbiddenException({ code: 'media_access_revoked' });
    }
    if (!asset.contentType) {
      throw new ConflictException({ code: 'media_metadata_incomplete' });
    }
    if (
      variant === MediaVariant.Preview &&
      (!asset.previewStorageLocationId ||
        !asset.previewFileKey ||
        !asset.previewLength ||
        !asset.previewContentType)
    ) {
      throw new ConflictException({ code: 'media_preview_unavailable' });
    }
  }

  private validateInspectionResult(
    asset: MediaUpload,
    result: InspectionResultDto,
  ): void {
    const inspected = result.outcome === InspectionOutcome.Inspected;
    if (!inspected) {
      if (
        result.length !== undefined ||
        result.sha256 !== undefined ||
        result.contentType !== undefined ||
        result.previewObject !== undefined ||
        result.previewLength !== undefined ||
        result.previewSha256 !== undefined ||
        result.previewContentType !== undefined
      ) {
        throw new UnprocessableEntityException({
          code: 'inspection_result_invalid',
        });
      }
      return;
    }

    if (
      result.length !== asset.length ||
      result.sha256 !== asset.sha256 ||
      result.contentType !== asset.contentType ||
      result.previewObject?.storageLocationId !== asset.storageLocationId ||
      result.previewObject?.fileKey !== asset.inspectionPreviewFileKey ||
      !result.previewLength ||
      !result.previewSha256 ||
      !result.previewContentType
    ) {
      throw new UnprocessableEntityException({
        code: 'inspection_result_invalid',
      });
    }
  }

  private sameInspectionResult(
    asset: MediaUpload,
    result: InspectionResultDto,
  ): boolean {
    if (
      asset.inspectionCompletedAttemptId !== result.attemptId ||
      asset.inspectionOutcome !== result.outcome
    ) {
      return false;
    }
    if (result.outcome !== InspectionOutcome.Inspected) {
      return (
        asset.processingStatus === ProcessingStatus.Failed &&
        result.length === undefined &&
        result.sha256 === undefined &&
        result.contentType === undefined &&
        result.previewObject === undefined &&
        result.previewLength === undefined &&
        result.previewSha256 === undefined &&
        result.previewContentType === undefined
      );
    }
    return (
      asset.processingStatus === ProcessingStatus.Ready &&
      asset.length === result.length &&
      asset.sha256 === result.sha256 &&
      asset.contentType === result.contentType &&
      asset.previewStorageLocationId ===
        result.previewObject?.storageLocationId &&
      asset.previewFileKey === result.previewObject?.fileKey &&
      asset.previewLength === result.previewLength &&
      asset.previewSha256 === result.previewSha256 &&
      asset.previewContentType === result.previewContentType
    );
  }

  private invalidGrant(): never {
    throw new ForbiddenException({ code: 'invalid_upload_grant' });
  }

  private invalidReadGrant(): never {
    throw new ForbiddenException({ code: 'invalid_media_grant' });
  }

  private value(key: NumericMediaConfigKey): number {
    const media = this.config.getOrThrow('media', { infer: true });
    return media[key];
  }
}

type NumericMediaConfigKey =
  | 'uploadGrantExpiresSeconds'
  | 'uploadLeaseSeconds'
  | 'readGrantExpiresSeconds'
  | 'inspectionLeaseSeconds'
  | 'maxUploadBytes'
  | 'accountQuotaBytes';

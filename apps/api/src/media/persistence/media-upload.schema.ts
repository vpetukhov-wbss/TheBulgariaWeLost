import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { uuidv7 } from 'uuidv7';

export enum UploadPurpose {
  ProfileImage = 'profile-image',
  MaterialOriginal = 'material-original',
  SourceDocument = 'source-document',
  AdvertisementCreative = 'advertisement-creative',
}

export enum UploadStatus {
  Pending = 'Pending',
  Claimed = 'Claimed',
  Completed = 'Completed',
  Expired = 'Expired',
}

export enum ProcessingStatus {
  Pending = 'Pending',
  Claimed = 'Claimed',
  Ready = 'Ready',
  Failed = 'Failed',
}

export enum MediaAccessStatus {
  Active = 'Active',
  Hidden = 'Hidden',
  Restricted = 'Restricted',
  Removed = 'Removed',
}

@Schema({ collection: 'mediaUploads', timestamps: true })
export class MediaUpload {
  @Prop({ type: String, default: uuidv7 })
  _id: string;

  @Prop({ type: Number, default: 2, required: true })
  schemaVersion: number;

  @Prop({ required: true })
  accountId: string;

  @Prop({ required: true })
  sessionId: string;

  @Prop({ type: String, enum: UploadPurpose, required: true })
  purpose: UploadPurpose;

  @Prop({ required: true })
  length: number;

  @Prop({ required: true })
  sha256: string;

  @Prop({ required: true })
  storageLocationId: string;

  @Prop({ required: true })
  fileKey: string;

  @Prop({ type: String, enum: UploadStatus, default: UploadStatus.Pending })
  status: UploadStatus;

  @Prop({ default: 1, required: true })
  attemptVersion: number;

  @Prop()
  activeAttemptId?: string;

  @Prop()
  leaseExpiresAt?: Date;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ default: true, required: true })
  quotaReserved: boolean;

  @Prop()
  completedAttemptId?: string;

  @Prop()
  completedAt?: Date;

  @Prop()
  contentType?: string;

  @Prop({ type: String, enum: ProcessingStatus })
  processingStatus?: ProcessingStatus;

  @Prop()
  inspectionAttemptId?: string;

  @Prop()
  inspectionLeaseExpiresAt?: Date;

  @Prop()
  inspectionPreviewFileKey?: string;

  @Prop()
  inspectionCompletedAttemptId?: string;

  @Prop()
  inspectionOutcome?: string;

  @Prop()
  inspectedAt?: Date;

  @Prop()
  previewStorageLocationId?: string;

  @Prop()
  previewFileKey?: string;

  @Prop()
  previewLength?: number;

  @Prop()
  previewSha256?: string;

  @Prop()
  previewContentType?: string;

  @Prop({
    type: String,
    enum: MediaAccessStatus,
    default: MediaAccessStatus.Active,
  })
  accessStatus: MediaAccessStatus;

  @Prop({ default: 1, required: true })
  accessVersion: number;
}

export const MediaUploadSchema = SchemaFactory.createForClass(MediaUpload);

MediaUploadSchema.index({ fileKey: 1 }, { unique: true });
MediaUploadSchema.index({ accountId: 1, status: 1, expiresAt: 1 });
MediaUploadSchema.index({ status: 1, leaseExpiresAt: 1 });
MediaUploadSchema.index({
  status: 1,
  processingStatus: 1,
  inspectionLeaseExpiresAt: 1,
  completedAt: 1,
});

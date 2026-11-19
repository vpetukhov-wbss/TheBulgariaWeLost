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

@Schema({ collection: 'mediaUploads', timestamps: true })
export class MediaUpload {
  @Prop({ type: String, default: uuidv7 })
  _id: string;

  @Prop({ type: Number, default: 1, required: true })
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
}

export const MediaUploadSchema = SchemaFactory.createForClass(MediaUpload);

MediaUploadSchema.index({ fileKey: 1 }, { unique: true });
MediaUploadSchema.index({ accountId: 1, status: 1, expiresAt: 1 });
MediaUploadSchema.index({ status: 1, leaseExpiresAt: 1 });

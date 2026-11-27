import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export enum BackupScope {
  MongoDb = 'MongoDb',
  SftpOriginals = 'SftpOriginals',
}

export enum BackupStatus {
  Running = 'Running',
  Succeeded = 'Succeeded',
  Failed = 'Failed',
}

@Schema({ collection: 'backupRuns', versionKey: false })
export class BackupRun {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ type: String, enum: BackupScope, required: true })
  scope: BackupScope;

  @Prop()
  storageLocationId?: string;

  @Prop({ type: String, enum: BackupStatus, required: true })
  status: BackupStatus;

  @Prop({ required: true })
  startedAt: Date;

  @Prop()
  finishedAt?: Date;

  @Prop()
  verifiedAt?: Date;

  @Prop()
  restoreTestedAt?: Date;

  @Prop({ required: true })
  traceId: string;

  @Prop({ required: true })
  version: number;
}

export const BackupRunSchema = SchemaFactory.createForClass(BackupRun);
BackupRunSchema.index({
  scope: 1,
  storageLocationId: 1,
  status: 1,
  finishedAt: -1,
});

@Schema({ collection: 'mediaWorkerHeartbeats', versionKey: false })
export class MediaWorkerHeartbeat {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ required: true })
  lastSeenAt: Date;

  @Prop({ required: true, expires: 86_400 })
  expiresAt: Date;
}

export const MediaWorkerHeartbeatSchema =
  SchemaFactory.createForClass(MediaWorkerHeartbeat);

@Schema({ collection: 'jobRetryCommands', versionKey: false })
export class JobRetryCommand {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ required: true })
  requestHash: string;

  @Prop({ required: true, expires: 0 })
  expiresAt: Date;
}

export const JobRetryCommandSchema =
  SchemaFactory.createForClass(JobRetryCommand);

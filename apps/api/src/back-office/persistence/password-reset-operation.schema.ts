import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export enum ResetOperationStatus {
  Queued = 'Queued',
  Running = 'Running',
  Succeeded = 'Succeeded',
  Failed = 'Failed',
}

@Schema({ collection: 'passwordResetOperations' })
export class PasswordResetOperation {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ required: true })
  requestedByUserId: string;

  @Prop({ required: true })
  targetId: string;

  @Prop({ required: true })
  targetVersion: number;

  @Prop({ required: true })
  targetAuthVersion: number;

  @Prop({ required: true })
  traceId: string;

  @Prop({ type: String, enum: ResetOperationStatus, required: true })
  status: ResetOperationStatus;

  @Prop({ required: true })
  requestedAt: Date;

  @Prop()
  startedAt?: Date;

  @Prop()
  finishedAt?: Date;
}

export const PasswordResetOperationSchema = SchemaFactory.createForClass(
  PasswordResetOperation,
);

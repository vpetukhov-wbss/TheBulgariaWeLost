import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { ModerationCaseDetailDto } from '../moderation.dto';
import {
  ModerationPriority,
  ModerationStatus,
  ModerationType,
  ReportReason,
  type Resolution,
} from '../moderation.types';

@Schema({ collection: 'moderationCases', timestamps: true })
export class ModerationCase {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ default: 1, required: true })
  schemaVersion: number;

  @Prop({ required: true })
  targetId: string;

  @Prop({ required: true })
  title: string;

  @Prop({ type: String, enum: ModerationType, required: true })
  caseType: ModerationType;

  @Prop({ type: String, enum: ModerationStatus, required: true })
  status: ModerationStatus;

  @Prop({ type: String, enum: ModerationPriority, required: true })
  priority: ModerationPriority;

  @Prop({ required: true })
  active: boolean;

  @Prop()
  assigneeId?: string;

  @Prop({ required: true })
  reportCount: number;

  @Prop({ required: true })
  version: number;

  @Prop({ type: Object })
  resolution?: Resolution;

  @Prop({ type: Object })
  withdrawal?: Resolution;

  createdAt: Date;
  updatedAt: Date;
}

export const ModerationCaseSchema =
  SchemaFactory.createForClass(ModerationCase);
ModerationCaseSchema.index(
  { targetId: 1, caseType: 1 },
  {
    name: 'active_target_and_type',
    unique: true,
    partialFilterExpression: { active: true },
  },
);
ModerationCaseSchema.index({ status: 1, priority: 1, updatedAt: -1, _id: -1 });

@Schema({ collection: 'moderationReports' })
export class ModerationReport {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ default: 1, required: true })
  schemaVersion: number;

  @Prop({ required: true })
  caseId: string;

  @Prop({ required: true })
  requestHash: string;

  @Prop({ required: true })
  payloadHash: string;

  @Prop({ type: String, enum: ReportReason, required: true })
  reasonCode: ReportReason;

  @Prop()
  description?: string;

  @Prop()
  evidenceUrl?: string;

  @Prop({ required: true })
  revisionNumber: number;

  @Prop({ required: true })
  createdAt: Date;
}

export const ModerationReportSchema =
  SchemaFactory.createForClass(ModerationReport);
ModerationReportSchema.index({ caseId: 1, createdAt: -1, _id: -1 });
ModerationReportSchema.index({ requestHash: 1 }, { unique: true });

@Schema({ collection: 'moderationDecisions' })
export class ModerationDecisionReceipt {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ default: 1, required: true })
  schemaVersion: number;

  @Prop({ required: true })
  requestHash: string;

  @Prop({ type: Object, required: true })
  response: ModerationCaseDetailDto;
}

export const ModerationDecisionReceiptSchema = SchemaFactory.createForClass(
  ModerationDecisionReceipt,
);

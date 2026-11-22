import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { uuidv7 } from 'uuidv7';

@Schema({ collection: 'auditEvents', timestamps: false })
export class PublishingAuditEvent {
  @Prop({ type: String, default: uuidv7 })
  _id: string;

  @Prop({ type: Number, default: 1, required: true })
  schemaVersion: number;

  @Prop({ required: true })
  actorId: string;

  @Prop({ required: true, maxlength: 100 })
  action: string;

  @Prop({ required: true })
  targetId: string;

  @Prop({ required: true })
  targetVersion: number;

  @Prop({ maxlength: 500 })
  reason?: string;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  @Prop({ required: true, maxlength: 128 })
  correlationId: string;

  @Prop({ required: true })
  occurredAt: Date;
}

export const PublishingAuditEventSchema =
  SchemaFactory.createForClass(PublishingAuditEvent);

PublishingAuditEventSchema.index({ targetId: 1, occurredAt: -1, _id: -1 });
PublishingAuditEventSchema.index({ correlationId: 1, _id: 1 });

@Schema({ collection: 'outboxEvents', timestamps: false })
export class PublishingOutboxEvent {
  @Prop({ type: String, default: uuidv7 })
  _id: string;

  @Prop({ type: Number, default: 1, required: true })
  schemaVersion: number;

  @Prop({ required: true, maxlength: 120 })
  eventType: string;

  @Prop({ required: true })
  aggregateId: string;

  @Prop({ required: true })
  aggregateVersion: number;

  @Prop({ type: Object, required: true })
  payload: Record<string, unknown>;

  @Prop({ required: true })
  occurredAt: Date;

  @Prop()
  publishedAt?: Date;
}

export const PublishingOutboxEventSchema = SchemaFactory.createForClass(
  PublishingOutboxEvent,
);

PublishingOutboxEventSchema.index(
  { aggregateId: 1, aggregateVersion: 1 },
  { unique: true },
);
PublishingOutboxEventSchema.index({ publishedAt: 1, occurredAt: 1, _id: 1 });

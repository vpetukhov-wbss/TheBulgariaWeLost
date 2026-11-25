import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { uuidv7 } from 'uuidv7';

@Schema({ collection: 'auditAccessEvents' })
export class AuditAccessEvent {
  @Prop({ type: String, default: uuidv7 })
  _id: string;

  @Prop({ required: true })
  actorId: string;

  @Prop({ type: String, enum: ['Listed', 'Viewed'], required: true })
  action: 'Listed' | 'Viewed';

  @Prop()
  auditEventId?: string;

  @Prop({ required: true })
  traceId: string;

  @Prop({ required: true })
  occurredAt: Date;
}

export const AuditAccessEventSchema =
  SchemaFactory.createForClass(AuditAccessEvent);
AuditAccessEventSchema.index({ occurredAt: -1, _id: -1 });

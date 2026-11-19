import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'mediaQuotas', timestamps: true })
export class MediaQuota {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ type: Number, default: 1, required: true })
  schemaVersion: number;

  @Prop({ default: 0, required: true })
  reservedBytes: number;

  @Prop({ required: true })
  quotaBytes: number;
}

export const MediaQuotaSchema = SchemaFactory.createForClass(MediaQuota);

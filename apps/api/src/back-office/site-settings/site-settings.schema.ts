import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { SiteSettingsInputDto } from './site-settings.dto';

@Schema({ collection: 'siteSettings' })
export class SiteSettings {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ type: Number, required: true, default: 1 })
  schemaVersion: number;

  @Prop({ type: Number, required: true })
  version: number;

  @Prop({ type: Object })
  configuration?: SiteSettingsInputDto;

  @Prop()
  lastChangedAt?: Date;
}

export const SiteSettingsSchema = SchemaFactory.createForClass(SiteSettings);

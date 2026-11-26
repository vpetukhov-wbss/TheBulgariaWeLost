import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { AdminMediaDetailDto } from './admin-media.dto';

@Schema({ collection: 'mediaAccessCommands' })
export class MediaAccessCommand {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ required: true })
  requestHash: string;

  @Prop({ type: Object, required: true })
  detail: AdminMediaDetailDto;

  @Prop({ required: true, expires: 0 })
  expiresAt: Date;
}

export const MediaAccessCommandSchema =
  SchemaFactory.createForClass(MediaAccessCommand);

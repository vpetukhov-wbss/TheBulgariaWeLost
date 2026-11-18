import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { uuidv7 } from 'uuidv7';

@Schema({ collection: 'sessions', timestamps: true })
export class Session {
  @Prop({ type: String, default: uuidv7 })
  _id: string;

  @Prop({ required: true, index: true })
  accountId: string;

  @Prop({ required: true })
  authVersion: number;

  @Prop({ required: true })
  hash: string;

  @Prop({ required: true, expires: 0 })
  expiresAt: Date;

  @Prop()
  mfaVerifiedAt?: Date;
}

export const SessionSchema = SchemaFactory.createForClass(Session);

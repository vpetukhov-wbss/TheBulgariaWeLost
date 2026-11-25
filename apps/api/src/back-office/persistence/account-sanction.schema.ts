import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { uuidv7 } from 'uuidv7';

@Schema({ collection: 'accountSanctions' })
export class AccountSanction {
  @Prop({ type: String, default: uuidv7 })
  _id: string;

  @Prop({ default: 1, required: true })
  schemaVersion: number;

  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  issuedByUserId: string;

  @Prop({ required: true, maxlength: 500 })
  reason: string;

  @Prop({ required: true })
  startsAt: Date;

  @Prop({ type: Date, default: null })
  expiresAt: Date | null;

  @Prop()
  revokedAt?: Date;

  @Prop()
  revokedByUserId?: string;

  @Prop({ maxlength: 500 })
  revokeReason?: string;
}

export const AccountSanctionSchema =
  SchemaFactory.createForClass(AccountSanction);
AccountSanctionSchema.index({ userId: 1, _id: -1 });

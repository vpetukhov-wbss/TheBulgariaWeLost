import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { uuidv7 } from 'uuidv7';

export enum Role {
  User = 'User',
  Editor = 'Editor',
  Administrator = 'Administrator',
}

export enum AccountStatus {
  Pending = 'Pending',
  Active = 'Active',
  Disabled = 'Disabled',
}

@Schema({ _id: false })
class ActiveAccountSanction {
  @Prop({ required: true })
  id: string;

  @Prop({ type: Date, default: null })
  expiresAt: Date | null;
}

const ActiveAccountSanctionSchema = SchemaFactory.createForClass(
  ActiveAccountSanction,
);

@Schema({ collection: 'users', timestamps: true })
export class Account {
  @Prop({ type: String, default: uuidv7 })
  _id: string;

  @Prop({ type: Number, default: 1, required: true })
  schemaVersion: number;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop({ required: true })
  firstName: string;

  @Prop({ required: true })
  lastName: string;

  @Prop({ type: String, enum: Role, default: Role.User, required: true })
  role: Role;

  @Prop({
    type: String,
    enum: AccountStatus,
    default: AccountStatus.Pending,
    required: true,
  })
  status: AccountStatus;

  @Prop({ default: 0, required: true })
  authVersion: number;

  @Prop({ required: true, default: 1 })
  adminVersion: number;

  @Prop({ select: false })
  administrationAccessVersion?: number;

  @Prop({ maxlength: 120 })
  displayName?: string;

  @Prop({ maxlength: 2000 })
  bio?: string;

  @Prop({ type: ActiveAccountSanctionSchema })
  activeSanction?: ActiveAccountSanction;

  @Prop({ default: false, required: true })
  mfaEnabled: boolean;

  @Prop({ select: false })
  mfaSecretEncrypted?: string;

  @Prop({ select: false })
  mfaPendingSecretEncrypted?: string;

  @Prop({ type: [String], select: false })
  mfaRecoveryCodeHashes?: string[];

  @Prop({ select: false })
  mfaLastUsedStep?: number;

  createdAt?: Date;
}

export const AccountSchema = SchemaFactory.createForClass(Account);

AccountSchema.index({ role: 1, status: 1, _id: 1 });

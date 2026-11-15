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

@Schema({ collection: 'users', timestamps: true })
export class Account {
  @Prop({ type: String, default: uuidv7 })
  _id: string;

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
}

export const AccountSchema = SchemaFactory.createForClass(Account);

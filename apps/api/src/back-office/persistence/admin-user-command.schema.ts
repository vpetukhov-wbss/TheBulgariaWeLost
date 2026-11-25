import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { AdminUserDetailDto } from '../admin-users.dto';

@Schema({ collection: 'adminUserCommands' })
export class AdminUserCommand {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ required: true })
  requestHash: string;

  @Prop({ type: Object, required: true })
  response: { detail: AdminUserDetailDto; change: object };

  @Prop({ required: true, expires: 0 })
  expiresAt: Date;
}

export const AdminUserCommandSchema =
  SchemaFactory.createForClass(AdminUserCommand);

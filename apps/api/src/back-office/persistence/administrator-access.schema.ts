import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'administratorAccess' })
export class AdministratorAccess {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ required: true })
  version: number;
}

export const AdministratorAccessSchema =
  SchemaFactory.createForClass(AdministratorAccess);

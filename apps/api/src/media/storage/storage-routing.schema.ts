import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { StorageConnectionStatus, StorageLocationStatus } from './storage.dto';

export interface StorageLocation {
  id: string;
  label: string;
  profileId: string;
  status: StorageLocationStatus;
  version: number;
  updatedAt: Date;
  probe?: { status: StorageConnectionStatus; checkedAt: Date; version: number };
}

@Schema({ collection: 'storageRouting', versionKey: false })
export class StorageRouting {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ type: Number, required: true, default: 1 })
  schemaVersion: number;

  @Prop({ required: true })
  activeProfileId: string;

  @Prop({ required: true })
  routingVersion: number;

  @Prop({ type: [Object], required: true })
  locations: StorageLocation[];
}

export const StorageRoutingSchema =
  SchemaFactory.createForClass(StorageRouting);

@Schema({ collection: 'storageCommands', versionKey: false })
export class StorageCommand {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ required: true })
  requestHash: string;

  @Prop({ type: Object })
  response?: object;

  @Prop({ required: true, expires: 0 })
  expiresAt: Date;
}

export const StorageCommandSchema =
  SchemaFactory.createForClass(StorageCommand);

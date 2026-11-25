import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'savedMaterials' })
export class SavedMaterial {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ type: String, required: true })
  accountId: string;

  @Prop({ type: String, required: true })
  materialId: string;

  @Prop({ type: Date, required: true })
  savedAt: Date;
}

export const SavedMaterialSchema = SchemaFactory.createForClass(SavedMaterial);
SavedMaterialSchema.index({ accountId: 1, savedAt: -1, _id: -1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { uuidv7 } from 'uuidv7';

export enum MaterialType {
  Story = 'Story',
  Document = 'Document',
  PhotoEssay = 'PhotoEssay',
  Episode = 'Episode',
}

export enum MaterialStatus {
  Unpublished = 'Unpublished',
  Published = 'Published',
  Withdrawn = 'Withdrawn',
  Archived = 'Archived',
}

export enum WorkingStatus {
  Draft = 'Draft',
  Submitted = 'Submitted',
  InReview = 'InReview',
  ChangesRequested = 'ChangesRequested',
}

export interface MaterialMediaReference {
  mediaId: string;
  role: string;
  order: number;
  credit?: string;
}

export interface MaterialRights {
  publicDisplayAllowed: boolean;
  statement: string;
}

export enum MaterialBlockType {
  Heading = 'Heading',
  Paragraph = 'Paragraph',
  Quote = 'Quote',
}

export interface MaterialBlock {
  id: string;
  type: MaterialBlockType;
  text: string;
}

export interface MaterialDraft {
  title: string;
  subtitle?: string;
  summary?: string;
  body?: string;
  blocks?: MaterialBlock[];
  categoryIds: string[];
  topicIds: string[];
  sourceIds: string[];
  placeIds?: string[];
  historicalYear?: number | null;
  mediaRefs: MaterialMediaReference[];
  provenance?: string;
  rights: MaterialRights;
}

@Schema({ collection: 'materials', timestamps: true })
export class Material {
  @Prop({ type: String, default: uuidv7 })
  _id: string;

  @Prop({ type: Number, default: 1, required: true })
  schemaVersion: number;

  @Prop({ required: true, maxlength: 160 })
  slug: string;

  @Prop({ type: String, enum: MaterialType, required: true })
  type: MaterialType;

  @Prop({ required: true, maxlength: 12 })
  language: string;

  @Prop({ required: true })
  authorId: string;

  @Prop({ type: String, enum: MaterialStatus, required: true })
  status: MaterialStatus;

  @Prop({ type: String, enum: WorkingStatus })
  workingStatus?: WorkingStatus;

  @Prop()
  workingRevisionNumber?: number;

  @Prop()
  publishedRevisionNumber?: number;

  @Prop({ default: 1, required: true })
  lastRevisionNumber: number;

  @Prop({ default: false, required: true })
  hasBeenSubmitted: boolean;

  @Prop({ default: false, required: true })
  publicVisibility: boolean;

  @Prop({ type: String })
  moderationCaseId?: string;

  @Prop({ type: String, enum: MaterialStatus })
  archivedFromStatus?: MaterialStatus;

  @Prop({ type: String, enum: WorkingStatus })
  archivedFromWorkingStatus?: WorkingStatus;

  @Prop({ type: String, maxlength: 500 })
  correctionNote?: string;

  @Prop({ default: 1, required: true })
  version: number;

  createdAt: Date;
  updatedAt: Date;
}

export const MaterialSchema = SchemaFactory.createForClass(Material);

MaterialSchema.index({ slug: 1 }, { unique: true });
MaterialSchema.index({ updatedAt: -1, _id: -1 });
MaterialSchema.index({ authorId: 1, updatedAt: -1, _id: -1 });
MaterialSchema.index({ status: 1, workingStatus: 1, updatedAt: -1, _id: -1 });

@Schema({ collection: 'materialRevisions', timestamps: true })
export class MaterialRevision {
  @Prop({ type: String, default: uuidv7 })
  _id: string;

  @Prop({ type: Number, default: 1, required: true })
  schemaVersion: number;

  @Prop({ required: true })
  materialId: string;

  @Prop({ required: true })
  revisionNumber: number;

  @Prop({ required: true })
  createdByUserId: string;

  @Prop({ maxlength: 500 })
  changeSummary?: string;

  @Prop()
  restoredFromRevisionNumber?: number;

  @Prop({ type: Object, required: true })
  content: MaterialDraft;

  createdAt: Date;
  updatedAt: Date;
}

export const MaterialRevisionSchema =
  SchemaFactory.createForClass(MaterialRevision);

MaterialRevisionSchema.index(
  { materialId: 1, revisionNumber: 1 },
  { unique: true },
);
MaterialRevisionSchema.index({ materialId: 1, revisionNumber: -1 });
MaterialRevisionSchema.index({ 'content.mediaRefs.mediaId': 1 });

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { uuidv7 } from 'uuidv7';

export enum CatalogKind {
  Topics = 'topics',
  Categories = 'categories',
  Entities = 'entities',
  Places = 'places',
  Sources = 'sources',
  ArchiveInstitutions = 'archive-institutions',
}

export enum CatalogStatus {
  Draft = 'Draft',
  Proposed = 'Proposed',
  Published = 'Published',
  Restricted = 'Restricted',
  Rejected = 'Rejected',
  Merged = 'Merged',
  Approved = 'Approved',
  Hidden = 'Hidden',
  Active = 'Active',
  Archived = 'Archived',
}

export enum CatalogTransition {
  Propose = 'Propose',
  Publish = 'Publish',
  Approve = 'Approve',
  Restrict = 'Restrict',
  Reject = 'Reject',
  Hide = 'Hide',
  Archive = 'Archive',
  Restore = 'Restore',
}

export const CatalogModelName = {
  [CatalogKind.Topics]: 'CatalogTopic',
  [CatalogKind.Categories]: 'CatalogCategory',
  [CatalogKind.Entities]: 'CatalogEntity',
  [CatalogKind.Places]: 'CatalogPlace',
  [CatalogKind.Sources]: 'CatalogSource',
  [CatalogKind.ArchiveInstitutions]: 'CatalogArchiveInstitution',
} as const;

export const CatalogCollection = {
  [CatalogKind.Topics]: 'topics',
  [CatalogKind.Categories]: 'categories',
  [CatalogKind.Entities]: 'entities',
  [CatalogKind.Places]: 'places',
  [CatalogKind.Sources]: 'sources',
  [CatalogKind.ArchiveInstitutions]: 'archiveInstitutions',
} as const;

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface LifeSpan {
  fromYear?: number;
  toYear?: number;
}

export interface SourceRights {
  publicDisplayAllowed: boolean;
  statement: string;
}

export interface SourceVerification {
  status: 'Unverified' | 'Verified' | 'Disputed';
  note?: string;
}

export interface ArchiveReference {
  fund?: string;
  inventory?: string;
  archiveUnit?: string;
  pageOrFrame?: string;
}

@Schema({ timestamps: true })
export class CatalogEntry {
  @Prop({ type: String, default: uuidv7 })
  _id: string;

  @Prop({ type: Number, default: 1, required: true })
  schemaVersion: number;

  @Prop({ type: String, enum: CatalogKind, required: true })
  kind: CatalogKind;

  @Prop({ required: true })
  createdByUserId: string;

  @Prop({ maxlength: 300 })
  name?: string;

  @Prop({ maxlength: 500 })
  title?: string;

  @Prop({ required: true, maxlength: 180 })
  slug: string;

  @Prop({ type: [String], default: [] })
  aliases: string[];

  @Prop({ maxlength: 5_000 })
  summary?: string;

  @Prop({ maxlength: 10_000 })
  description?: string;

  @Prop({ type: [String], default: [] })
  categoryIds: string[];

  @Prop()
  coverAssetId?: string;

  @Prop()
  parentId?: string;

  @Prop({ default: 0 })
  sortOrder?: number;

  @Prop({ maxlength: 100 })
  icon?: string;

  @Prop({ default: false })
  isVisible?: boolean;

  @Prop({ maxlength: 100 })
  entityType?: string;

  @Prop({ type: Object })
  lifeSpan?: LifeSpan;

  @Prop({ type: [String], default: [] })
  placeIds: string[];

  @Prop({ maxlength: 100 })
  placeType?: string;

  @Prop({ type: Object })
  location?: GeoPoint;

  @Prop({ type: [String], default: [] })
  historicalNames: string[];

  @Prop({ maxlength: 100 })
  sourceType?: string;

  @Prop({ maxlength: 2_000 })
  url?: string;

  @Prop({ type: Object })
  rights?: SourceRights;

  @Prop({ type: Object })
  verification?: SourceVerification;

  @Prop()
  archiveInstitutionId?: string;

  @Prop({ type: Object })
  archiveReference?: ArchiveReference;

  @Prop({ maxlength: 500 })
  originalInstitutionName?: string;

  @Prop({ maxlength: 2_000 })
  website?: string;

  @Prop({ type: String, enum: CatalogStatus, required: true })
  status: CatalogStatus;

  @Prop()
  canonicalId?: string;

  @Prop({ default: 1, required: true })
  version: number;

  createdAt: Date;
  updatedAt: Date;
}

export const CatalogEntrySchema = SchemaFactory.createForClass(CatalogEntry);

CatalogEntrySchema.index({ slug: 1 }, { unique: true });
CatalogEntrySchema.index({ status: 1, updatedAt: -1, _id: -1 });
CatalogEntrySchema.index({ parentId: 1, sortOrder: 1, name: 1, _id: 1 });

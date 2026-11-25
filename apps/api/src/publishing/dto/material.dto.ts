import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  MaterialBlockType,
  MaterialStatus,
  MaterialType,
  WorkingStatus,
  type MaterialDraft,
} from '../persistence/material.schema';

const languagePattern = /^[a-z]{2}(?:-[A-Z]{2})?$/;

export enum MaterialTransition {
  SubmitForReview = 'SubmitForReview',
  StartReview = 'StartReview',
  RequestChanges = 'RequestChanges',
  Publish = 'Publish',
  Withdraw = 'Withdraw',
  Archive = 'Archive',
  RestoreFromArchive = 'RestoreFromArchive',
}

export class MaterialMediaReferenceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  mediaId: string;

  @ApiProperty({ maxLength: 50 })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  role: string;

  @ApiProperty({ minimum: 0, maximum: 1_000 })
  @IsInt()
  @Min(0)
  @Max(1_000)
  order: number;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  credit?: string;
}

export class MaterialRightsDto {
  @ApiProperty()
  @IsBoolean()
  publicDisplayAllowed: boolean;

  @ApiProperty({ maxLength: 2_000 })
  @IsString()
  @MinLength(3)
  @MaxLength(2_000)
  statement: string;
}

export class CreateMaterialDto {
  @ApiProperty({ enum: MaterialType })
  @IsEnum(MaterialType)
  type: MaterialType;

  @ApiProperty({ example: 'bg', pattern: languagePattern.source })
  @IsString()
  @Matches(languagePattern)
  language: string;

  @ApiProperty({ minLength: 3, maxLength: 200 })
  @IsString()
  @MinLength(3)
  @Matches(/\S/)
  @MaxLength(200)
  title: string;
}

export class MaterialBlockDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id: string;

  @ApiProperty({ enum: MaterialBlockType })
  @IsEnum(MaterialBlockType)
  type: MaterialBlockType;

  @ApiProperty({ maxLength: 6_000 })
  @IsString()
  @MaxLength(6_000)
  text: string;
}

export class UpdateMaterialDraftDto {
  @ApiPropertyOptional({ minLength: 3, maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  subtitle?: string;

  @ApiPropertyOptional({ maxLength: 1_000 })
  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  summary?: string;

  @ApiPropertyOptional({ maxLength: 100_000 })
  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  body?: string;

  @ApiPropertyOptional({ type: [MaterialBlockDto], maxItems: 40 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ArrayUnique((block: MaterialBlockDto | null) => block?.id)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => MaterialBlockDto)
  blocks?: MaterialBlockDto[];

  @ApiPropertyOptional({ type: [String], maxItems: 100 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  categoryIds?: string[];

  @ApiPropertyOptional({ type: [String], maxItems: 100 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  topicIds?: string[];

  @ApiPropertyOptional({ type: [String], maxItems: 100 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  sourceIds?: string[];

  @ApiPropertyOptional({ type: [MaterialMediaReferenceDto], maxItems: 100 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => MaterialMediaReferenceDto)
  mediaRefs?: MaterialMediaReferenceDto[];

  @ApiPropertyOptional({ maxLength: 2_000 })
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  provenance?: string;

  @ApiPropertyOptional({ type: MaterialRightsDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MaterialRightsDto)
  rights?: MaterialRightsDto;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeSummary?: string;
}

export class TransitionMaterialDto {
  @ApiProperty({ enum: MaterialTransition })
  @IsEnum(MaterialTransition)
  action: MaterialTransition;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;

  @ApiPropertyOptional({ minLength: 3, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason?: string;
}

export class SubmitAuthorMaterialDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;
}

export class RestoreMaterialRevisionDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  revisionNumber: number;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;

  @ApiProperty({ minLength: 3, maxLength: 500 })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class MaterialRevisionSummaryDto {
  @ApiProperty({ format: 'uuid' })
  materialId: string;

  @ApiProperty({ minimum: 1 })
  revisionNumber: number;

  @ApiProperty({ format: 'date-time' })
  createdAtUtc: string;

  @ApiProperty({ format: 'uuid' })
  createdByUserId: string;

  @ApiPropertyOptional()
  changeSummary?: string;

  @ApiPropertyOptional()
  restoredFromRevisionNumber?: number;
}

export class MaterialRevisionDetailDto extends MaterialRevisionSummaryDto {
  @ApiProperty({ type: Object })
  content: MaterialDraft;
}

export class MaterialDetailDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  slug: string;

  @ApiProperty({ enum: MaterialType })
  type: MaterialType;

  @ApiProperty()
  language: string;

  @ApiProperty({ format: 'uuid' })
  authorId: string;

  @ApiProperty({ enum: MaterialStatus })
  status: MaterialStatus;

  @ApiPropertyOptional({ enum: WorkingStatus })
  workingStatus?: WorkingStatus;

  @ApiPropertyOptional()
  workingRevisionNumber?: number;

  @ApiPropertyOptional()
  publishedRevisionNumber?: number;

  @ApiProperty()
  publicVisibility: boolean;

  @ApiProperty({ type: Object })
  draft: MaterialDraft;

  @ApiProperty({ type: [String] })
  allowedActions: string[];

  @ApiProperty({ type: [String] })
  publicationBlockers: string[];

  @ApiPropertyOptional({ maxLength: 500 })
  correctionNote?: string;

  @ApiProperty({ minimum: 1 })
  version: number;

  @ApiProperty({ format: 'date-time' })
  updatedAtUtc: string;
}

export class MaterialSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  slug: string;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional({ enum: MaterialType })
  type?: MaterialType;

  @ApiProperty({ enum: MaterialStatus })
  status: MaterialStatus;

  @ApiPropertyOptional({ enum: WorkingStatus })
  workingStatus?: WorkingStatus;

  @ApiProperty({ minimum: 1 })
  version: number;

  @ApiProperty({ format: 'date-time' })
  updatedAtUtc: string;
}

export class MaterialPageDto {
  @ApiProperty({ type: [MaterialSummaryDto] })
  items: MaterialSummaryDto[];

  @ApiPropertyOptional()
  nextCursor?: string;
}

export class MaterialRevisionPageDto {
  @ApiProperty({ type: [MaterialRevisionSummaryDto] })
  items: MaterialRevisionSummaryDto[];

  @ApiPropertyOptional()
  nextCursor?: string;
}

export class PublicMaterialDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  slug: string;

  @ApiProperty({ enum: MaterialType })
  type: MaterialType;

  @ApiProperty()
  language: string;

  @ApiProperty()
  revisionNumber: number;

  @ApiProperty({ type: Object })
  content: MaterialDraft;
}

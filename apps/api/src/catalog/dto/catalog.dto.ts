import { OmitType } from '@nestjs/swagger';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  CatalogKind,
  CatalogStatus,
  CatalogTransition,
  type ArchiveReference,
  type GeoPoint,
  type LifeSpan,
  type SourceRights,
  type SourceVerification,
} from '../persistence/catalog.schema';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class GeoPointDto implements GeoPoint {
  @ApiProperty({ minimum: -90, maximum: 90 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({ minimum: -180, maximum: 180 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;
}

export class LifeSpanDto implements LifeSpan {
  @ApiPropertyOptional({ minimum: -5000, maximum: 3000 })
  @IsOptional()
  @IsInt()
  @Min(-5000)
  @Max(3000)
  fromYear?: number;

  @ApiPropertyOptional({ minimum: -5000, maximum: 3000 })
  @IsOptional()
  @IsInt()
  @Min(-5000)
  @Max(3000)
  toYear?: number;
}

export class SourceRightsDto implements SourceRights {
  @ApiProperty()
  @IsBoolean()
  publicDisplayAllowed: boolean;

  @ApiProperty({ minLength: 3, maxLength: 2_000 })
  @IsString()
  @MinLength(3)
  @MaxLength(2_000)
  statement: string;
}

export class SourceVerificationDto implements SourceVerification {
  @ApiProperty({ enum: ['Unverified', 'Verified', 'Disputed'] })
  @IsIn(['Unverified', 'Verified', 'Disputed'])
  status: 'Unverified' | 'Verified' | 'Disputed';

  @ApiPropertyOptional({ maxLength: 2_000 })
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  note?: string;
}

export class ArchiveReferenceDto implements ArchiveReference {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fund?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  inventory?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  archiveUnit?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  pageOrFrame?: string;
}

export class CatalogInputDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 300 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  name?: string;

  @ApiPropertyOptional({ minLength: 2, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  title?: string;

  @ApiPropertyOptional({ pattern: slugPattern.source, maxLength: 180 })
  @IsOptional()
  @IsString()
  @Matches(slugPattern)
  @MaxLength(180)
  slug?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 100 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  aliases?: string[];

  @ApiPropertyOptional({ maxLength: 5_000 })
  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  summary?: string;

  @ApiPropertyOptional({ maxLength: 10_000 })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 100 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  categoryIds?: string[];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  coverAssetId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional({ minimum: -100000, maximum: 100000 })
  @IsOptional()
  @IsInt()
  @Min(-100000)
  @Max(100000)
  sortOrder?: number;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  icon?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityType?: string;

  @ApiPropertyOptional({ type: LifeSpanDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LifeSpanDto)
  lifeSpan?: LifeSpanDto;

  @ApiPropertyOptional({ type: [String], maxItems: 100 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  placeIds?: string[];

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  placeType?: string;

  @ApiPropertyOptional({ type: GeoPointDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GeoPointDto)
  location?: GeoPointDto;

  @ApiPropertyOptional({ type: [String], maxItems: 100 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  historicalNames?: string[];

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sourceType?: string;

  @ApiPropertyOptional({ maxLength: 2_000 })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(2_000)
  url?: string;

  @ApiPropertyOptional({ type: SourceRightsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SourceRightsDto)
  rights?: SourceRightsDto;

  @ApiPropertyOptional({ type: SourceVerificationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SourceVerificationDto)
  verification?: SourceVerificationDto;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  archiveInstitutionId?: string;

  @ApiPropertyOptional({ type: ArchiveReferenceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ArchiveReferenceDto)
  archiveReference?: ArchiveReferenceDto;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  originalInstitutionName?: string;

  @ApiPropertyOptional({ maxLength: 2_000 })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(2_000)
  website?: string;
}

export class CatalogTransitionDto {
  @ApiProperty({ enum: CatalogTransition })
  @IsEnum(CatalogTransition)
  action: CatalogTransition;

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

export class CatalogMergeDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  targetId: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  targetExpectedVersion: number;

  @ApiProperty({ minLength: 3, maxLength: 500 })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class CatalogSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: CatalogKind })
  kind: CatalogKind;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiProperty({ enum: CatalogStatus })
  status: CatalogStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  canonicalId?: string;

  @ApiProperty({ minimum: 1 })
  version: number;

  @ApiProperty({ format: 'date-time' })
  updatedAtUtc: string;
}

export class CatalogDetailDto extends CatalogSummaryDto {
  @ApiProperty({ type: Object })
  fields: Record<string, unknown>;

  @ApiProperty({ type: [String] })
  allowedActions: string[];
}

export class CatalogPageDto {
  @ApiProperty({ type: [CatalogSummaryDto] })
  items: CatalogSummaryDto[];

  @ApiPropertyOptional()
  nextCursor?: string;
}

export class CatalogMergeAcceptedDto {
  @ApiProperty({ format: 'uuid' })
  operationId: string;

  @ApiProperty()
  statusUrl: string;

  @ApiProperty({ format: 'uuid' })
  sourceId: string;

  @ApiProperty({ format: 'uuid' })
  targetId: string;
}

export class PublicCatalogDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: CatalogKind })
  kind: CatalogKind;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiProperty({ type: Object })
  fields: Record<string, unknown>;
}

export class PublicCatalogListItemDto extends OmitType(PublicCatalogDto, [
  'fields',
] as const) {}

export class PublicCatalogListDto {
  @ApiProperty({ type: [PublicCatalogListItemDto] })
  items: PublicCatalogListItemDto[];

  @ApiPropertyOptional({ format: 'uuid' })
  nextAfter?: string;
}

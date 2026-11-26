import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  MediaAccessStatus,
  ProcessingStatus,
  UploadPurpose,
} from '../persistence/media-upload.schema';

export enum AdminMediaType {
  Image = 'Image',
  Pdf = 'Pdf',
  Other = 'Other',
}

export enum AdminMediaRightsStatus {
  Recorded = 'Recorded',
  Missing = 'Missing',
}

export enum MediaRestrictionAction {
  Restrict = 'Restrict',
  LiftRestriction = 'LiftRestriction',
}

const trim = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);

export class AdminMediaQueryDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @trim
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: MediaAccessStatus })
  @IsOptional()
  @IsEnum(MediaAccessStatus)
  accessStatus?: MediaAccessStatus;

  @ApiPropertyOptional({ enum: ProcessingStatus })
  @IsOptional()
  @IsEnum(ProcessingStatus)
  processingStatus?: ProcessingStatus;

  @ApiPropertyOptional({ enum: AdminMediaType })
  @IsOptional()
  @IsEnum(AdminMediaType)
  type?: AdminMediaType;

  @ApiPropertyOptional({ enum: AdminMediaRightsStatus })
  @IsOptional()
  @IsEnum(AdminMediaRightsStatus)
  rightsStatus?: AdminMediaRightsStatus;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  cursor?: string;
}

export class AdminMediaSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: AdminMediaType })
  type: AdminMediaType;

  @ApiProperty({ enum: UploadPurpose })
  purpose: UploadPurpose;

  @ApiProperty({ enum: ProcessingStatus })
  processingStatus: ProcessingStatus;

  @ApiProperty({ enum: MediaAccessStatus })
  accessStatus: MediaAccessStatus;

  @ApiProperty({ enum: AdminMediaRightsStatus })
  rightsStatus: AdminMediaRightsStatus;

  @ApiPropertyOptional()
  accessibilityText?: string;

  @ApiPropertyOptional()
  creditLine?: string;

  @ApiProperty({ format: 'date-time' })
  updatedAtUtc: string;
}

export class AdminMediaDetailDto extends AdminMediaSummaryDto {
  @ApiPropertyOptional()
  rightsEvidence?: string;

  @ApiPropertyOptional()
  contentType?: string;

  @ApiProperty({ format: 'int64', minimum: 1 })
  length: number;

  @ApiPropertyOptional()
  inspectionOutcome?: string;

  @ApiProperty()
  previewAvailable: boolean;

  @ApiProperty()
  publicationEligible: boolean;

  @ApiProperty({ minimum: 1 })
  version: number;

  @ApiProperty()
  canEdit: boolean;

  @ApiPropertyOptional({ enum: MediaRestrictionAction })
  restrictionAction?: MediaRestrictionAction;
}

export class AdminMediaPageDto {
  @ApiProperty({ type: [AdminMediaSummaryDto] })
  items: AdminMediaSummaryDto[];

  @ApiPropertyOptional()
  nextCursor?: string;
}

export class MediaUsageDto {
  @ApiProperty({ format: 'uuid' })
  materialId: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ minimum: 1 })
  revisionNumber: number;
}

export class MediaUsagesDto {
  @ApiProperty({ type: [MediaUsageDto] })
  items: MediaUsageDto[];

  @ApiProperty({ minimum: 0 })
  total: number;
}

class MediaAuditReasonDto {
  @ApiProperty({ maxLength: 500 })
  @trim
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

export class EditAdminMediaDto extends MediaAuditReasonDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @trim
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(200)
  creditLine?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @trim
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(500)
  accessibilityText?: string;

  @ApiPropertyOptional({ maxLength: 2_000 })
  @trim
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(2_000)
  rightsEvidence?: string;
}

export class ChangeMediaRestrictionDto extends MediaAuditReasonDto {
  @ApiProperty({ enum: MediaRestrictionAction })
  @IsEnum(MediaRestrictionAction)
  action: MediaRestrictionAction;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
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
import { UploadPurpose } from '../persistence/media-upload.schema';

const sha256Pattern = /^[a-f0-9]{64}$/;
const contentTypePattern = /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/i;

export enum MediaVariant {
  Original = 'original',
  Preview = 'preview',
}

export enum InspectionOutcome {
  Inspected = 'inspected',
  Missing = 'missing',
  IntegrityMismatch = 'integrity_mismatch',
  UnsupportedFormat = 'unsupported_format',
  StorageUnavailable = 'storage_unavailable',
  Timeout = 'inspection_timeout',
}

export class CreateUploadDto {
  @ApiProperty({ enum: UploadPurpose })
  @IsEnum(UploadPurpose)
  purpose: UploadPurpose;

  @ApiProperty({ minimum: 1, maximum: 33_554_432, format: 'int64' })
  @IsInt()
  @Min(1)
  @Max(33_554_432)
  length: number;

  @ApiProperty({ pattern: '^[a-f0-9]{64}$' })
  @IsString()
  @Matches(sha256Pattern)
  sha256: string;

  @ApiPropertyOptional({
    maxLength: 500,
    description: 'Accessible description supplied by the author.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  alternativeText?: string;

  @ApiPropertyOptional({
    maxLength: 2_000,
    description: 'Source, permission or licence evidence for editorial review.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(2_000)
  rightsEvidence?: string;
}

export class UploadSessionDto {
  @ApiProperty({ format: 'uuid' })
  uploadId: string;

  @ApiProperty({ example: '/media/v1/uploads/019ab...' })
  uploadUrl: string;

  @ApiProperty({ description: 'Short-lived bearer grant for the media API.' })
  grant: string;

  @ApiProperty({ format: 'date-time' })
  expiresAtUtc: string;

  @ApiProperty({ format: 'int64' })
  maxBytes: number;

  @ApiProperty()
  attemptVersion: number;
}

export class GrantRequestDto {
  @ApiProperty({ maxLength: 4096 })
  @IsString()
  @MaxLength(4096)
  grant: string;
}

export class UploadReceiptDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('7')
  attemptId: string;

  @ApiProperty({ format: 'int64', minimum: 1 })
  @IsInt()
  @Min(1)
  length: number;

  @ApiProperty({ pattern: '^[a-f0-9]{64}$' })
  @IsString()
  @Matches(sha256Pattern)
  sha256: string;

  @ApiProperty({ example: 'image/png', maxLength: 255 })
  @IsString()
  @MaxLength(255)
  @Matches(contentTypePattern)
  contentType: string;
}

export class ObjectReferenceDto {
  @ApiProperty()
  @IsString()
  @MaxLength(100)
  storageLocationId: string;

  @ApiProperty({ pattern: '^[a-f0-9]{64}$' })
  @IsString()
  @Matches(sha256Pattern)
  fileKey: string;
}

export class UploadClaimDto {
  @ApiProperty({ format: 'uuid' })
  attemptId: string;

  @ApiProperty()
  attemptVersion: number;

  @ApiProperty({ type: ObjectReferenceDto })
  object: ObjectReferenceDto;

  @ApiProperty({ format: 'int64' })
  length: number;

  @ApiProperty({ pattern: '^[a-f0-9]{64}$' })
  sha256: string;
}

export class MediaAssetDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: ['Pending', 'Claimed', 'Ready', 'Failed'] })
  processingStatus: string;

  @ApiPropertyOptional()
  contentType?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  alternativeText?: string;

  @ApiPropertyOptional({ maxLength: 2_000 })
  rightsEvidence?: string;

  @ApiPropertyOptional({ maxLength: 128 })
  correlationId?: string;

  @ApiProperty({ type: [String], enum: MediaVariant })
  variants: MediaVariant[];
}

export class CreateReadGrantDto {
  @ApiProperty({ enum: MediaVariant })
  @IsEnum(MediaVariant)
  variant: MediaVariant;
}

export class ReadGrantDto {
  @ApiProperty({ format: 'uuid' })
  assetId: string;

  @ApiProperty({ enum: MediaVariant })
  variant: MediaVariant;

  @ApiProperty()
  grant: string;

  @ApiProperty()
  url: string;

  @ApiProperty({ format: 'date-time' })
  expiresAtUtc: string;
}

export class AuthorizeReadRequestDto extends GrantRequestDto {
  @ApiProperty({ enum: MediaVariant })
  @IsEnum(MediaVariant)
  variant: MediaVariant;
}

export class ReadDecisionDto {
  @ApiProperty({ type: ObjectReferenceDto })
  object: ObjectReferenceDto;

  @ApiProperty({ format: 'int64' })
  length: number;

  @ApiProperty()
  contentType: string;
}

export class InspectionLeaseRequestDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  workerId?: string;
}

export class InspectionLeaseDto {
  @ApiPropertyOptional({ maxLength: 128 })
  traceId?: string;

  @ApiProperty({ format: 'uuid' })
  jobId: string;

  @ApiProperty({ format: 'uuid' })
  attemptId: string;

  @ApiProperty({ type: ObjectReferenceDto })
  object: ObjectReferenceDto;

  @ApiProperty({ type: ObjectReferenceDto })
  previewObject: ObjectReferenceDto;

  @ApiProperty({ format: 'int64' })
  length: number;

  @ApiProperty({ pattern: '^[a-f0-9]{64}$' })
  sha256: string;
}

export class InspectionResultDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('7')
  attemptId: string;

  @ApiProperty({ enum: InspectionOutcome })
  @IsEnum(InspectionOutcome)
  outcome: InspectionOutcome;

  @ApiPropertyOptional({ format: 'int64', minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  length?: number;

  @ApiPropertyOptional({ pattern: '^[a-f0-9]{64}$' })
  @IsOptional()
  @IsString()
  @Matches(sha256Pattern)
  sha256?: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(contentTypePattern)
  contentType?: string;

  @ApiPropertyOptional({ type: ObjectReferenceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ObjectReferenceDto)
  previewObject?: ObjectReferenceDto;

  @ApiPropertyOptional({ format: 'int64', minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  previewLength?: number;

  @ApiPropertyOptional({ pattern: '^[a-f0-9]{64}$' })
  @IsOptional()
  @IsString()
  @Matches(sha256Pattern)
  previewSha256?: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(contentTypePattern)
  previewContentType?: string;
}

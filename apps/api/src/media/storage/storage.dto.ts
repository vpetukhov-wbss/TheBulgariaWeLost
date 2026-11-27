import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export const storageProfilePattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/;

export enum StorageLocationStatus {
  Draft = 'Draft',
  ActiveForNewWrites = 'ActiveForNewWrites',
  ReadOnly = 'ReadOnly',
  Archived = 'Archived',
}

export enum StorageConnectionStatus {
  NotChecked = 'NotChecked',
  Healthy = 'Healthy',
  Unavailable = 'Unavailable',
  Denied = 'Denied',
}

export enum StorageTransition {
  ActivateForNewWrites = 'ActivateForNewWrites',
  ArchiveDraft = 'ArchiveDraft',
}

export enum StorageAssetIssueKind {
  Missing = 'Missing',
  FailedUpload = 'FailedUpload',
  IntegrityMismatch = 'IntegrityMismatch',
}

const trim = Transform(({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value,
);

export class StoragePageQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @ValidateIf((_, value) => value !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ maxLength: 200 })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  cursor?: string;
}

export class StorageLocationQueryDto extends StoragePageQueryDto {
  @ApiPropertyOptional({ enum: StorageLocationStatus })
  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(StorageLocationStatus)
  status?: StorageLocationStatus;
}

export class StorageAssetIssueQueryDto extends StoragePageQueryDto {
  @ApiPropertyOptional({ enum: StorageAssetIssueKind })
  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(StorageAssetIssueKind)
  kind?: StorageAssetIssueKind;
}

export class CreateStorageLocationDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @trim
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label: string;

  @ApiProperty({ pattern: storageProfilePattern.source })
  @IsString()
  @Matches(storageProfilePattern)
  profileId: string;
}

export class EditStorageLocationDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 100 })
  @ValidateIf((_, value) => value !== undefined)
  @trim
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label?: string;

  @ApiPropertyOptional({ pattern: storageProfilePattern.source })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Matches(storageProfilePattern)
  profileId?: string;
}

export class CheckStorageConnectionDto {
  @ApiProperty({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedVersion: number;
}

export class TransitionStorageLocationDto extends CheckStorageConnectionDto {
  @ApiProperty({ enum: StorageTransition })
  @IsEnum(StorageTransition)
  action: StorageTransition;

  @ApiPropertyOptional({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })
  @ValidateIf(
    (dto: TransitionStorageLocationDto, value) =>
      dto.action === StorageTransition.ActivateForNewWrites ||
      value !== undefined,
  )
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedRoutingVersion?: number;

  @ApiProperty({ minLength: 1, maxLength: 500 })
  @trim
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

export class StorageConnectionProfileDto {
  @ApiProperty({ pattern: storageProfilePattern.source })
  id: string;

  @ApiProperty()
  label: string;
}

export class StorageConnectionProfilePageDto {
  @ApiProperty({ type: [StorageConnectionProfileDto] })
  items: StorageConnectionProfileDto[];

  @ApiPropertyOptional()
  nextCursor?: string;
}

export class StorageLocationSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  label: string;

  @ApiProperty({ enum: ['Sftp'] })
  provider: 'Sftp';

  @ApiProperty()
  profileId: string;

  @ApiProperty({ enum: StorageLocationStatus })
  status: StorageLocationStatus;

  @ApiProperty({ minimum: 1 })
  version: number;

  @ApiProperty({ format: 'date-time' })
  updatedAtUtc: string;

  @ApiProperty({ enum: StorageConnectionStatus })
  connectionStatus: StorageConnectionStatus;
}

export class StorageLocationDetailDto extends StorageLocationSummaryDto {
  @ApiProperty({ minimum: 1 })
  routingVersion: number;

  @ApiProperty({ enum: StorageTransition, isArray: true })
  transitions: StorageTransition[];
}

export class StorageLocationPageDto {
  @ApiProperty({ type: [StorageLocationSummaryDto] })
  items: StorageLocationSummaryDto[];

  @ApiPropertyOptional()
  nextCursor?: string;
}

export class StorageHealthDto {
  @ApiProperty({ format: 'uuid' })
  locationId: string;

  @ApiProperty({ enum: StorageConnectionStatus })
  status: StorageConnectionStatus;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  checkedAtUtc: string | null;

  @ApiProperty({ type: Number, nullable: true, format: 'int64' })
  usedBytes: number | null;

  @ApiProperty({ type: Number, nullable: true, format: 'int64' })
  capacityBytes: number | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  lastSuccessfulBackupAtUtc: string | null;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  lastVerifiedRestoreAtUtc: string | null;
}

export class StorageAssetIssueDto {
  @ApiPropertyOptional({ format: 'uuid' })
  assetId?: string;

  @ApiProperty({ format: 'uuid' })
  uploadId: string;

  @ApiProperty({ enum: StorageAssetIssueKind })
  kind: StorageAssetIssueKind;

  @ApiProperty({ format: 'date-time' })
  detectedAtUtc: string;
}

export class StorageAssetIssuePageDto {
  @ApiProperty({ type: [StorageAssetIssueDto] })
  items: StorageAssetIssueDto[];

  @ApiPropertyOptional()
  nextCursor?: string;
}

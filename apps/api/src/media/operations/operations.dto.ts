import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { StoragePageQueryDto } from '../storage/storage.dto';
import { BackupScope, BackupStatus } from './operations.schema';

export enum JobType {
  MediaInspection = 'MediaInspection',
  PasswordResetEmail = 'PasswordResetEmail',
}

export enum JobStatus {
  Queued = 'Queued',
  Running = 'Running',
  Succeeded = 'Succeeded',
  Failed = 'Failed',
}

export class OperationsPageQueryDto extends StoragePageQueryDto {
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  fromUtc?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  toUtc?: string;
}

export class JobQueryDto extends OperationsPageQueryDto {
  @ApiPropertyOptional({ enum: JobType })
  @IsOptional()
  @IsEnum(JobType)
  type?: JobType;

  @ApiPropertyOptional({ enum: JobStatus })
  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;
}

export class BackupQueryDto extends OperationsPageQueryDto {
  @ApiPropertyOptional({ enum: BackupScope })
  @IsOptional()
  @IsEnum(BackupScope)
  scope?: BackupScope;

  @ApiPropertyOptional({ enum: BackupStatus })
  @IsOptional()
  @IsEnum(BackupStatus)
  status?: BackupStatus;
}

export class RetryJobDto {
  @ApiProperty({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedVersion: number;

  @ApiProperty({ maxLength: 500 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

export class JobRetryReceiptDto {
  @ApiProperty({ format: 'uuid' })
  operationId: string;

  @ApiProperty()
  statusUrl: string;
}

export class JobSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: JobType })
  type: JobType;

  @ApiProperty({ enum: JobStatus })
  status: JobStatus;

  @ApiProperty({ minimum: 0 })
  attemptCount: number;

  @ApiProperty({ minimum: 1 })
  version: number;

  @ApiProperty({ format: 'date-time' })
  updatedAtUtc: string;

  @ApiProperty()
  traceId: string;

  @ApiProperty()
  canRetry: boolean;

  @ApiPropertyOptional()
  lastErrorCode?: string;
}

export class JobAttemptDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiPropertyOptional({ format: 'uuid' })
  workerId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  startedAtUtc?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  finishedAtUtc?: string;

  @ApiPropertyOptional()
  outcome?: string;
}

export class JobDetailDto extends JobSummaryDto {
  @ApiProperty({ format: 'uuid' })
  targetId: string;

  @ApiProperty({ type: [JobAttemptDto] })
  attempts: JobAttemptDto[];

  @ApiPropertyOptional()
  lastRetryTraceId?: string;
}

export class JobPageDto {
  @ApiProperty({ type: [JobSummaryDto] })
  items: JobSummaryDto[];

  @ApiPropertyOptional()
  nextCursor?: string;
}

export class BackupReportDto {
  @ApiProperty({ enum: BackupScope })
  @IsEnum(BackupScope)
  scope: BackupScope;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('7')
  storageLocationId?: string;

  @ApiProperty({ enum: BackupStatus })
  @IsEnum(BackupStatus)
  status: BackupStatus;

  @ApiProperty({ format: 'date-time' })
  @IsISO8601({ strict: true, strictSeparator: true })
  startedAtUtc: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  finishedAtUtc?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  verifiedAtUtc?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  restoreTestedAtUtc?: string;
}

export class BackupRunDto extends BackupReportDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  traceId: string;
}

export class BackupPageDto {
  @ApiProperty({ type: [BackupRunDto] })
  items: BackupRunDto[];

  @ApiPropertyOptional()
  nextCursor?: string;
}

export class WorkerStatusDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'date-time' })
  lastSeenAtUtc: string;

  @ApiProperty()
  online: boolean;
}

export class BackupHealthDto {
  @ApiProperty({ enum: BackupScope })
  scope: BackupScope;

  @ApiPropertyOptional({ format: 'uuid' })
  storageLocationId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  lastSuccessfulBackupAtUtc?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  lastVerificationAtUtc?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  lastVerifiedRestoreAtUtc?: string;
}

export class OperationsAlertDto {
  @ApiProperty()
  code: string;

  @ApiProperty()
  target: string;
}

export class OperationsSummaryDto {
  @ApiProperty({ format: 'date-time' })
  measuredAtUtc: string;

  @ApiProperty({ type: [WorkerStatusDto] })
  workers: WorkerStatusDto[];

  @ApiProperty({ type: [BackupHealthDto] })
  backups: BackupHealthDto[];

  @ApiProperty({ type: [OperationsAlertDto] })
  alerts: OperationsAlertDto[];
}

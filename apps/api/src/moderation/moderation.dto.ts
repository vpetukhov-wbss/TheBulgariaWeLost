import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MaterialStatus } from '../publishing/persistence/material.schema';
import {
  ModerationDecision,
  ModerationPriority,
  ModerationStatus,
  ModerationType,
  ReportReason,
} from './moderation.types';

export class CreateModerationReportDto {
  @ApiProperty({ enum: ReportReason })
  @IsEnum(ReportReason)
  reasonCode: ReportReason;

  @ApiPropertyOptional({ maxLength: 1500 })
  @IsOptional()
  @IsString()
  @MaxLength(1500)
  description?: string;

  @ApiPropertyOptional({ maxLength: 1500 })
  @IsOptional()
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    disallow_auth: true,
  })
  @MaxLength(1500)
  evidenceUrl?: string;
}

export class UpdateModerationCaseDto {
  @ApiProperty({ enum: ModerationPriority })
  @IsEnum(ModerationPriority)
  priority: ModerationPriority;
}

export class DecideModerationCaseDto {
  @ApiProperty({ enum: ModerationDecision })
  @IsEnum(ModerationDecision)
  decision: ModerationDecision;

  @ApiProperty({ minLength: 3, maxLength: 500 })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  targetExpectedVersion?: number;
}

export class ModerationCaseSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  targetId: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ enum: ModerationType })
  caseType: ModerationType;

  @ApiProperty({ enum: ModerationPriority })
  priority: ModerationPriority;

  @ApiProperty({ enum: ModerationStatus })
  status: ModerationStatus;

  @ApiProperty({ minimum: 1 })
  reportCount: number;

  @ApiProperty({ format: 'date-time' })
  createdAtUtc: string;

  @ApiProperty({ format: 'date-time' })
  updatedAtUtc: string;

  @ApiPropertyOptional({ format: 'uuid' })
  assigneeId?: string;

  @ApiProperty({ minimum: 1 })
  version: number;
}

export class ModerationTargetDto {
  @ApiProperty()
  slug: string;

  @ApiProperty({ enum: MaterialStatus })
  status: MaterialStatus;

  @ApiProperty()
  version: number;

  @ApiProperty()
  publicVisibility: boolean;
}

export class ModerationResolutionDto {
  @ApiProperty({ enum: ModerationDecision })
  decision: ModerationDecision;

  @ApiProperty()
  reason: string;

  @ApiProperty({ format: 'date-time' })
  decidedAtUtc: string;
}

export class ModerationCaseDetailDto extends ModerationCaseSummaryDto {
  @ApiProperty({ type: ModerationTargetDto })
  target: ModerationTargetDto;

  @ApiProperty()
  canTake: boolean;

  @ApiProperty({ enum: ModerationDecision, isArray: true })
  allowedDecisions: ModerationDecision[];

  @ApiPropertyOptional({ type: ModerationResolutionDto })
  resolution?: ModerationResolutionDto;

  @ApiPropertyOptional({ type: ModerationResolutionDto })
  withdrawal?: ModerationResolutionDto;
}

export class ModerationCasePageDto {
  @ApiProperty({ type: [ModerationCaseSummaryDto] })
  items: ModerationCaseSummaryDto[];
}

export class ModerationReportDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: ReportReason })
  reasonCode: ReportReason;

  @ApiPropertyOptional()
  description?: string;

  @ApiPropertyOptional()
  evidenceUrl?: string;

  @ApiProperty()
  revisionNumber: number;

  @ApiProperty({ format: 'date-time' })
  createdAtUtc: string;
}

export class ModerationReportPageDto {
  @ApiProperty({ type: [ModerationReportDto] })
  items: ModerationReportDto[];
}

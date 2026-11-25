import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Role } from '../auth/persistence/account.schema';
import { AuditOutcome, AuditTargetType } from './audit-event.types';

const timestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export class AuditQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z][A-Za-z0-9]{0,99}$/)
  action?: string;

  @ApiPropertyOptional({ enum: AuditTargetType })
  @IsOptional()
  @IsEnum(AuditTargetType)
  targetType?: AuditTargetType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  targetId?: string;

  @ApiPropertyOptional({ enum: AuditOutcome })
  @IsOptional()
  @IsEnum(AuditOutcome)
  outcome?: AuditOutcome;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Inclusive UTC bound.',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(timestamp)
  fromUtc?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Exclusive UTC bound.',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(timestamp)
  toUtc?: string;

  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  cursor?: string;
}

export class AuditEventSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'date-time' })
  occurredAtUtc: string;

  @ApiProperty({ format: 'uuid' })
  actorId: string;

  @ApiPropertyOptional({ enum: Role })
  actorRole?: Role;

  @ApiProperty()
  action: string;

  @ApiProperty({ enum: AuditTargetType })
  targetType: AuditTargetType;

  @ApiProperty({ format: 'uuid' })
  targetId: string;

  @ApiProperty({ enum: AuditOutcome })
  outcome: AuditOutcome;
}

export class AuditChangeDto {
  @ApiProperty()
  field: string;

  @ApiProperty()
  value: string;
}

export class AuditEventDetailDto extends AuditEventSummaryDto {
  @ApiPropertyOptional()
  reason?: string;

  @ApiPropertyOptional({ type: [AuditChangeDto] })
  changeSummary?: AuditChangeDto[];

  @ApiProperty()
  traceId: string;

  @ApiPropertyOptional({ format: 'uuid' })
  operationId?: string;
}

export class AuditEventPageDto {
  @ApiProperty({ type: [AuditEventSummaryDto] })
  items: AuditEventSummaryDto[];

  @ApiPropertyOptional()
  nextCursor?: string;
}

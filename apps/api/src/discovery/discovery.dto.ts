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
} from 'class-validator';
import { MaterialType } from '../publishing/persistence/material.schema';

export class ArchiveSearchQuery {
  @ApiPropertyOptional({ maxLength: 150 })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MaxLength(150)
  q?: string;

  @ApiPropertyOptional({ enum: MaterialType })
  @IsOptional()
  @IsEnum(MaterialType)
  type?: MaterialType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('7')
  topicId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('7')
  categoryId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('7')
  placeId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 9999 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9999)
  fromYear?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 9999 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9999)
  toYear?: number;

  @ApiPropertyOptional({ maxLength: 12 })
  @IsOptional()
  @Matches(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/)
  @MaxLength(12)
  language?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ maxLength: 220 })
  @IsOptional()
  @IsString()
  @MaxLength(220)
  cursor?: string;
}

export class ArchiveSearchItem {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  slug: string;

  @ApiProperty({ enum: MaterialType })
  type: MaterialType;

  @ApiProperty()
  language: string;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional()
  summary?: string;
}

export class ArchiveSearchPage {
  @ApiProperty({ type: [ArchiveSearchItem] })
  items: ArchiveSearchItem[];

  @ApiPropertyOptional()
  nextCursor?: string;
}

export class RebuildSearchPage {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('7')
  after?: string;
}

export class RebuildSearchResult {
  @ApiProperty()
  processed: number;

  @ApiPropertyOptional({ format: 'uuid' })
  nextAfter?: string;
}

export class SearchMetrics {
  @ApiProperty()
  enabled: boolean;

  @ApiProperty()
  pending: number;

  @ApiProperty()
  retrying: number;

  @ApiPropertyOptional({ format: 'date-time' })
  oldestPendingAtUtc?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  lastProjectedAtUtc?: string;
}

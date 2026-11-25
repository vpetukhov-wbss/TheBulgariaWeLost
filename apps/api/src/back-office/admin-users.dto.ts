import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AccountStatus, Role } from '../auth/persistence/account.schema';

export class AdminUserQueryDto {
  @ApiPropertyOptional({ maxLength: 254 })
  @IsOptional()
  @IsString()
  @MaxLength(254)
  q?: string;

  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({ enum: AccountStatus })
  @IsOptional()
  @IsEnum(AccountStatus)
  status?: AccountStatus;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  cursor?: string;
}

export class AdminUserSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  displayName: string;

  @ApiProperty({ enum: Role })
  role: Role;

  @ApiProperty({ enum: AccountStatus })
  status: AccountStatus;

  @ApiPropertyOptional({ format: 'date-time' })
  createdAtUtc?: string;
}

export class AdminUserDetailDto extends AdminUserSummaryDto {
  @ApiPropertyOptional()
  verifiedContactMasked?: string;

  @ApiProperty()
  mfaEnabled: boolean;
}

export class AdminUserPageDto {
  @ApiProperty({ type: [AdminUserSummaryDto] })
  items: AdminUserSummaryDto[];

  @ApiPropertyOptional()
  nextCursor?: string;
}

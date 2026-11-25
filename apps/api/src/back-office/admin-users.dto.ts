import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { AccountStatus, Role } from '../auth/persistence/account.schema';
import { ResetOperationStatus } from './persistence/password-reset-operation.schema';

export const adminAccountStatuses = [
  ...Object.values(AccountStatus),
  'Banned',
] as const;
export type AdminAccountStatus = AccountStatus | 'Banned';

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

  @ApiPropertyOptional({ enum: adminAccountStatuses })
  @IsOptional()
  @IsIn(adminAccountStatuses)
  status?: AdminAccountStatus;

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

  @ApiProperty({ enum: adminAccountStatuses })
  status: AdminAccountStatus;

  @ApiPropertyOptional({ format: 'date-time' })
  createdAtUtc?: string;
}

export class AccountSanctionDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ format: 'uuid' })
  issuedByUserId: string;

  @ApiProperty()
  reason: string;

  @ApiProperty({ format: 'date-time' })
  startsAtUtc: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  expiresAtUtc: string | null;

  @ApiPropertyOptional({ format: 'date-time' })
  revokedAtUtc?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  revokedByUserId?: string;

  @ApiPropertyOptional()
  revokeReason?: string;
}

export class AdminUserDetailDto extends AdminUserSummaryDto {
  @ApiPropertyOptional()
  verifiedContactMasked?: string;

  @ApiProperty()
  mfaEnabled: boolean;

  @ApiProperty({ minimum: 1 })
  version: number;

  @ApiPropertyOptional()
  bio?: string;

  @ApiPropertyOptional({ type: AccountSanctionDto })
  activeSanction?: AccountSanctionDto;
}

export class AdminUserPageDto {
  @ApiProperty({ type: [AdminUserSummaryDto] })
  items: AdminUserSummaryDto[];

  @ApiPropertyOptional()
  nextCursor?: string;
}

export class AccountSanctionPageDto {
  @ApiProperty({ type: [AccountSanctionDto] })
  items: AccountSanctionDto[];

  @ApiPropertyOptional()
  nextCursor?: string;
}

export class AdminUserVersionDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion: number;
}

export class EditAdminUserDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 120 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(/\S/u)
  @MaxLength(120)
  displayName?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(2000)
  bio?: string;
}

export class AdminUserDecisionDto extends AdminUserVersionDto {
  @ApiProperty({ minLength: 3, maxLength: 500 })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class ChangeAdminUserRoleDto extends AdminUserDecisionDto {
  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role: Role;
}

export class CreateAccountSanctionDto extends AdminUserDecisionDto {
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  @ValidateIf((_object, value) => value !== null)
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/u)
  expiresAtUtc: string | null;
}

export class AccountSanctionsQueryDto {
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

export class PasswordResetAcceptedDto {
  @ApiProperty({ format: 'uuid' })
  operationId: string;

  @ApiProperty()
  statusUrl: string;
}

export class PasswordResetOperationDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: ['AccountPasswordReset'] })
  kind: 'AccountPasswordReset';

  @ApiProperty({ enum: ResetOperationStatus })
  status: ResetOperationStatus;

  @ApiProperty({ format: 'uuid' })
  requestedByUserId: string;

  @ApiProperty({ format: 'uuid' })
  targetId: string;

  @ApiProperty({ format: 'date-time' })
  requestedAtUtc: string;

  @ApiPropertyOptional({ format: 'date-time' })
  finishedAtUtc?: string;

  @ApiProperty()
  traceId: string;
}

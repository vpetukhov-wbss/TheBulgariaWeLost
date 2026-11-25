import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const count = { type: 'integer' as const, minimum: 0 };

export class DashboardAdministrativeDto {
  @ApiProperty(count)
  bannedAccounts: number;

  @ApiProperty(count)
  failedPasswordResetsLast24Hours: number;

  @ApiProperty(count)
  auditEventsLast24Hours: number;
}

export class DashboardSummaryDto {
  @ApiProperty({ format: 'date-time' })
  asOfUtc: string;

  @ApiProperty(count)
  submittedMaterials: number;

  @ApiProperty(count)
  materialsInReview: number;

  @ApiProperty(count)
  openModerationCases: number;

  @ApiProperty(count)
  restrictedMedia: number;

  @ApiPropertyOptional({ type: DashboardAdministrativeDto })
  administrative?: DashboardAdministrativeDto;
}

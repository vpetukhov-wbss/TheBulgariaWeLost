import {
  Controller,
  Get,
  Req,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { SignedInAccount } from '../auth/strategies/jwt.strategy';
import type { RequestWithUser } from '../utils/types/request-with-user.type';
import { BackOfficeGuard } from './back-office.guard';
import { DashboardSummaryDto } from './dashboard.dto';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller({ path: 'admin/v1/dashboard', version: VERSION_NEUTRAL })
@UseGuards(AuthGuard('jwt'), BackOfficeGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ApiOkResponse({ type: DashboardSummaryDto })
  @ApiForbiddenResponse({
    description: 'Back-office access or recent administrator MFA required.',
  })
  summary(
    @Req() request: RequestWithUser<SignedInAccount>,
  ): Promise<DashboardSummaryDto> {
    return this.dashboard.summary(request.user.profile.role);
  }
}

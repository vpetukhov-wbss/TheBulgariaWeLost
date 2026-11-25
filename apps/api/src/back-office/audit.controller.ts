import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { SignedInAccount } from '../auth/strategies/jwt.strategy';
import type { RequestWithUser } from '../utils/types/request-with-user.type';
import { AdministratorGuard } from './administrator.guard';
import {
  AuditEventDetailDto,
  AuditEventPageDto,
  AuditQueryDto,
} from './audit.dto';
import { AuditService } from './audit.service';
import { BackOfficeGuard } from './back-office.guard';

@ApiTags('Audit')
@ApiBearerAuth()
@ApiForbiddenResponse({
  description: 'Administrator access and recent MFA required.',
})
@Controller({ path: 'admin/v1/audit-events', version: VERSION_NEUTRAL })
@UseGuards(AuthGuard('jwt'), BackOfficeGuard, AdministratorGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: AuditEventPageDto })
  @ApiBadRequestResponse({
    description: 'Invalid cursor or incompatible time bounds.',
  })
  @ApiUnprocessableEntityResponse({ description: 'Invalid filter values.' })
  list(
    @Query() query: AuditQueryDto,
    @Req() request: RequestWithUser<SignedInAccount>,
  ): Promise<AuditEventPageDto> {
    return this.audit.list(
      query,
      request.user.profile.id,
      request.correlationId,
    );
  }

  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({ type: AuditEventDetailDto })
  @ApiNotFoundResponse({ description: 'Audit event unavailable.' })
  detail(
    @Param('id', new ParseUUIDPipe({ version: '7' })) id: string,
    @Req() request: RequestWithUser<SignedInAccount>,
  ): Promise<AuditEventDetailDto> {
    return this.audit.detail(
      id,
      request.user.profile.id,
      request.correlationId,
    );
  }
}

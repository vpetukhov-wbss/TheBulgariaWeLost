import {
  Body,
  Controller,
  Get,
  Headers,
  Put,
  Req,
  Res,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiPreconditionFailedResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { SignedInAccount } from '../../auth/strategies/jwt.strategy';
import type { RequestWithUser } from '../../utils/types/request-with-user.type';
import { AdministratorGuard } from '../administrator.guard';
import { BackOfficeGuard } from '../back-office.guard';
import {
  PublicSiteSettingsDto,
  SiteSettingsDto,
  UpdateSiteSettingsDto,
} from './site-settings.dto';
import { SiteSettingsService } from './site-settings.service';

@ApiTags('Admin site settings')
@ApiBearerAuth()
@ApiForbiddenResponse({
  description: 'Administrator access and recent MFA required.',
})
@Controller({ path: 'admin/v1/site-settings', version: VERSION_NEUTRAL })
@UseGuards(AuthGuard('jwt'), BackOfficeGuard, AdministratorGuard)
export class AdminSiteSettingsController {
  constructor(private readonly settings: SiteSettingsService) {}

  @Get()
  @ApiOkResponse({
    type: SiteSettingsDto,
    headers: { ETag: { schema: { type: 'string' } } },
  })
  async get(
    @Res({ passthrough: true }) response: Response,
  ): Promise<SiteSettingsDto> {
    const settings = await this.settings.get();
    response.setHeader('ETag', SiteSettingsService.etag(settings.version));
    return settings;
  }

  @Put()
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOkResponse({
    type: SiteSettingsDto,
    headers: { ETag: { schema: { type: 'string' } } },
  })
  @ApiPreconditionFailedResponse({
    description: 'Settings have changed since they were loaded.',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Invalid settings or unavailable featured material.',
  })
  async replace(
    @Req() request: RequestWithUser<SignedInAccount>,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() dto: UpdateSiteSettingsDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SiteSettingsDto> {
    const settings = await this.settings.replace(
      request.user,
      request.correlationId,
      ifMatch,
      dto,
    );
    response.setHeader('ETag', SiteSettingsService.etag(settings.version));
    return settings;
  }
}

@ApiTags('Public site settings')
@Controller({ path: 'site-settings', version: '1' })
export class PublicSiteSettingsController {
  constructor(private readonly settings: SiteSettingsService) {}

  @Get()
  @ApiOkResponse({ type: PublicSiteSettingsDto })
  get(): Promise<PublicSiteSettingsDto> {
    return this.settings.publicSettings();
  }
}

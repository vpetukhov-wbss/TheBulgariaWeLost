import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import type { SignedInAccount } from '../auth/strategies/jwt.strategy';
import { BackOfficeGuard } from '../back-office/back-office.guard';
import type { RequestWithUser } from '../utils/types/request-with-user.type';
import {
  CreateModerationReportDto,
  DecideModerationCaseDto,
  ModerationCaseDetailDto,
  ModerationCasePageDto,
  ModerationReportPageDto,
  UpdateModerationCaseDto,
} from './moderation.dto';
import { ModerationService } from './moderation.service';
import {
  ModerationPriority,
  ModerationStatus,
  ModerationType,
} from './moderation.types';

type EditorialRequest = RequestWithUser<SignedInAccount>;

@ApiTags('Moderation')
@Controller({ path: 'materials', version: '1' })
export class MaterialReportsController {
  constructor(private readonly moderation: ModerationService) {}

  @Post(':slug/reports')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 8 } })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiAcceptedResponse({ description: 'Accepted for editorial review.' })
  submit(
    @Param('slug') slug: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: CreateModerationReportDto,
  ): Promise<void> {
    return this.moderation.report(slug, key, body);
  }
}

@ApiTags('Moderation')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), BackOfficeGuard)
@Controller({ path: 'admin/v1/moderation-cases', version: VERSION_NEUTRAL })
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Get()
  @ApiOkResponse({ type: ModerationCasePageDto })
  list(
    @Query('status', new ParseEnumPipe(ModerationStatus, { optional: true }))
    status?: ModerationStatus,
    @Query(
      'priority',
      new ParseEnumPipe(ModerationPriority, { optional: true }),
    )
    priority?: ModerationPriority,
    @Query('caseType', new ParseEnumPipe(ModerationType, { optional: true }))
    caseType?: ModerationType,
  ): Promise<ModerationCasePageDto> {
    return this.moderation.list({ status, priority, caseType });
  }

  @Get(':id')
  @ApiOkResponse({ type: ModerationCaseDetailDto })
  async detail(
    @Req() request: EditorialRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ModerationCaseDetailDto> {
    return this.tag(response, await this.moderation.get(request.user, id));
  }

  @Get(':id/reports')
  @ApiOkResponse({ type: ModerationReportPageDto })
  reports(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ModerationReportPageDto> {
    return this.moderation.listReports(id);
  }

  @Patch(':id')
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOkResponse({ type: ModerationCaseDetailDto })
  async take(
    @Req() request: EditorialRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateModerationCaseDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ModerationCaseDetailDto> {
    const version = ModerationService.version(id, ifMatch);
    return this.tag(
      response,
      await this.moderation.take(
        request.user,
        id,
        body.priority,
        version,
        request.correlationId,
      ),
    );
  }

  @Post(':id/decisions')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: ModerationCaseDetailDto })
  async decide(
    @Req() request: EditorialRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: DecideModerationCaseDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ModerationCaseDetailDto> {
    return this.tag(
      response,
      await this.moderation.decide(
        request.user,
        id,
        key,
        body,
        request.correlationId,
      ),
    );
  }

  private tag(
    response: Response,
    record: ModerationCaseDetailDto,
  ): ModerationCaseDetailDto {
    response.setHeader('ETag', ModerationService.etag(record));
    return record;
  }
}

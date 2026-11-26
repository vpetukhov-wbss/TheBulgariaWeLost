import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  HttpCode,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { SignedInAccount } from '../../auth/strategies/jwt.strategy';
import { AdministratorGuard } from '../../back-office/administrator.guard';
import { BackOfficeGuard } from '../../back-office/back-office.guard';
import type { RequestWithUser } from '../../utils/types/request-with-user.type';
import { ReadGrantDto } from '../dto/media-upload.dto';
import { MediaService } from '../media.service';
import {
  AdminMediaDetailDto,
  AdminMediaPageDto,
  AdminMediaQueryDto,
  ChangeMediaRestrictionDto,
  EditAdminMediaDto,
  MediaUsagesDto,
} from './admin-media.dto';
import { AdminMediaService } from './admin-media.service';

type Request = RequestWithUser<SignedInAccount>;
const uuid = new ParseUUIDPipe({ version: '7' });

@ApiTags('Admin media')
@ApiBearerAuth()
@Controller({ path: 'admin/v1/media-assets', version: VERSION_NEUTRAL })
@UseGuards(AuthGuard('jwt'), BackOfficeGuard)
export class AdminMediaController {
  constructor(
    private readonly gallery: AdminMediaService,
    private readonly media: MediaService,
  ) {}

  @Get()
  @ApiOkResponse({ type: AdminMediaPageDto })
  list(
    @Req() request: Request,
    @Query() query: AdminMediaQueryDto,
  ): Promise<AdminMediaPageDto> {
    return this.gallery.list(request.user, query);
  }

  @Get(':id')
  @ApiOkResponse({ type: AdminMediaDetailDto })
  async detail(
    @Req() request: Request,
    @Param('id', uuid) id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AdminMediaDetailDto> {
    return this.tag(response, await this.gallery.detail(request.user, id));
  }

  @Get(':id/usages')
  @ApiOkResponse({ type: MediaUsagesDto })
  usages(
    @Req() request: Request,
    @Param('id', uuid) id: string,
  ): Promise<MediaUsagesDto> {
    return this.gallery.usages(request.user, id);
  }

  @Patch(':id')
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOkResponse({ type: AdminMediaDetailDto })
  async edit(
    @Req() request: Request,
    @Param('id', uuid) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: EditAdminMediaDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AdminMediaDetailDto> {
    return this.tag(
      response,
      await this.gallery.edit(
        { ...request.user, correlationId: request.correlationId },
        id,
        ifMatch,
        body,
      ),
    );
  }

  @Post(':id/access-restrictions')
  @HttpCode(200)
  @UseGuards(AdministratorGuard)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: AdminMediaDetailDto })
  async restrict(
    @Req() request: Request,
    @Param('id', uuid) id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: ChangeMediaRestrictionDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AdminMediaDetailDto> {
    return this.tag(
      response,
      await this.gallery.restrict(
        { ...request.user, correlationId: request.correlationId },
        id,
        key,
        body,
      ),
    );
  }

  @Post(':id/preview-grants')
  @ApiCreatedResponse({ type: ReadGrantDto })
  preview(
    @Req() request: Request,
    @Param('id', uuid) id: string,
  ): Promise<ReadGrantDto> {
    return this.media.createBackOfficePreviewGrant(request.user, id);
  }

  private tag(
    response: Response,
    media: AdminMediaDetailDto,
  ): AdminMediaDetailDto {
    response.setHeader('ETag', AdminMediaService.etag(media));
    return media;
  }
}

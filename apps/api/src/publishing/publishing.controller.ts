import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
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
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { SignedInAccount } from '../auth/strategies/jwt.strategy';
import { BackOfficeGuard } from '../back-office/back-office.guard';
import type { RequestWithUser } from '../utils/types/request-with-user.type';
import {
  CreateMaterialDto,
  MaterialDetailDto,
  MaterialPageDto,
  MaterialRevisionDetailDto,
  MaterialRevisionPageDto,
  PublicMaterialDto,
  RestoreMaterialRevisionDto,
  TransitionMaterialDto,
  UpdateMaterialDraftDto,
} from './dto/material.dto';
import {
  MaterialStatus,
  MaterialType,
  WorkingStatus,
} from './persistence/material.schema';
import { PublishingService } from './publishing.service';

@ApiTags('Publishing')
@ApiBearerAuth()
@Controller({ path: 'admin/v1/materials', version: VERSION_NEUTRAL })
@UseGuards(AuthGuard('jwt'), BackOfficeGuard)
export class PublishingController {
  constructor(private readonly publishing: PublishingService) {}

  @Get()
  @ApiOkResponse({ type: MaterialPageDto })
  @ApiQuery({ name: 'status', enum: MaterialStatus, required: false })
  @ApiQuery({ name: 'workingStatus', enum: WorkingStatus, required: false })
  @ApiQuery({ name: 'type', enum: MaterialType, required: false })
  list(
    @Req() request: RequestWithUser<SignedInAccount>,
    @Query('status', new ParseEnumPipe(MaterialStatus, { optional: true }))
    status?: MaterialStatus,
    @Query(
      'workingStatus',
      new ParseEnumPipe(WorkingStatus, { optional: true }),
    )
    workingStatus?: WorkingStatus,
    @Query('type', new ParseEnumPipe(MaterialType, { optional: true }))
    type?: MaterialType,
  ): Promise<MaterialPageDto> {
    return this.publishing.list(request.user, false, {
      status,
      workingStatus,
      type,
    });
  }

  @Post()
  @ApiCreatedResponse({ type: MaterialDetailDto })
  async create(
    @Req() request: RequestWithUser<SignedInAccount>,
    @Body() dto: CreateMaterialDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MaterialDetailDto> {
    const material = await this.publishing.create(
      request.user,
      dto,
      request.correlationId,
    );
    response.location(`/api/admin/v1/materials/${material.id}`);
    response.setHeader('ETag', PublishingService.etag(material));
    return material;
  }

  @Get(':id')
  @ApiOkResponse({ type: MaterialDetailDto })
  async get(
    @Req() request: RequestWithUser<SignedInAccount>,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MaterialDetailDto> {
    const material = await this.publishing.get(request.user, id);
    response.setHeader('ETag', PublishingService.etag(material));
    return material;
  }

  @Patch(':id')
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOkResponse({ type: MaterialDetailDto })
  async update(
    @Req() request: RequestWithUser<SignedInAccount>,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() dto: UpdateMaterialDraftDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MaterialDetailDto> {
    const material = await this.publishing.updateDraft(
      request.user,
      id,
      PublishingService.versionFromEtag(id, ifMatch),
      dto,
      request.correlationId,
    );
    response.setHeader('ETag', PublishingService.etag(material));
    return material;
  }

  @Post(':id/transitions')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: MaterialDetailDto })
  async transition(
    @Req() request: RequestWithUser<SignedInAccount>,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionMaterialDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MaterialDetailDto> {
    const material = await this.publishing.transition(
      request.user,
      id,
      dto,
      request.correlationId,
    );
    response.setHeader('ETag', PublishingService.etag(material));
    return material;
  }

  @Get(':id/revisions')
  @ApiOkResponse({ type: MaterialRevisionPageDto })
  revisions(
    @Req() request: RequestWithUser<SignedInAccount>,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MaterialRevisionPageDto> {
    return this.publishing.revisionsFor(request.user, id);
  }

  @Get(':id/revisions/:number')
  @ApiOkResponse({ type: MaterialRevisionDetailDto })
  revision(
    @Req() request: RequestWithUser<SignedInAccount>,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('number', ParseIntPipe) number: number,
  ): Promise<MaterialRevisionDetailDto> {
    return this.publishing.revision(request.user, id, number);
  }

  @Post(':id/revision-restorations')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: MaterialDetailDto })
  async restoreRevision(
    @Req() request: RequestWithUser<SignedInAccount>,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RestoreMaterialRevisionDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MaterialDetailDto> {
    const material = await this.publishing.restoreRevision(
      request.user,
      id,
      dto,
      request.correlationId,
    );
    response.setHeader('ETag', PublishingService.etag(material));
    return material;
  }
}

@ApiTags('Publishing')
@Controller({ path: 'materials', version: '1' })
export class PublicPublishingController {
  constructor(private readonly publishing: PublishingService) {}

  @Get(':slug')
  @ApiOkResponse({ type: PublicMaterialDto })
  publicMaterial(@Param('slug') slug: string): Promise<PublicMaterialDto> {
    return this.publishing.publicBySlug(slug);
  }
}

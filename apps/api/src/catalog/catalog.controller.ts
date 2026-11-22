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
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { SignedInAccount } from '../auth/strategies/jwt.strategy';
import { BackOfficeGuard } from '../back-office/back-office.guard';
import type { RequestWithUser } from '../utils/types/request-with-user.type';
import { CatalogService } from './catalog.service';
import {
  CatalogDetailDto,
  CatalogInputDto,
  CatalogMergeAcceptedDto,
  CatalogMergeDto,
  CatalogPageDto,
  CatalogTransitionDto,
  PublicCatalogDto,
} from './dto/catalog.dto';
import { CatalogKind, CatalogStatus } from './persistence/catalog.schema';

@ApiTags('Catalog')
@ApiBearerAuth()
@Controller({ path: 'admin/v1/catalog', version: VERSION_NEUTRAL })
@UseGuards(AuthGuard('jwt'), BackOfficeGuard)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get(':kind')
  @ApiOkResponse({ type: CatalogPageDto })
  list(
    @Param('kind', new ParseEnumPipe(CatalogKind)) kind: CatalogKind,
    @Query('q') query?: string,
    @Query('status', new ParseEnumPipe(CatalogStatus, { optional: true }))
    status?: CatalogStatus,
    @Query('parentId') parentId?: string,
  ): Promise<CatalogPageDto> {
    return this.catalog.list(kind, query, status, parentId);
  }

  @Post(':kind')
  @ApiCreatedResponse({ type: CatalogDetailDto })
  async create(
    @Req() request: RequestWithUser<SignedInAccount>,
    @Param('kind', new ParseEnumPipe(CatalogKind)) kind: CatalogKind,
    @Body() dto: CatalogInputDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CatalogDetailDto> {
    const entry = await this.catalog.create(
      request.user,
      kind,
      dto,
      request.correlationId,
    );
    response.location(`/api/admin/v1/catalog/${kind}/${entry.id}`);
    response.setHeader('ETag', CatalogService.etag(entry));
    return entry;
  }

  @Get(':kind/:id')
  @ApiOkResponse({ type: CatalogDetailDto })
  async get(
    @Param('kind', new ParseEnumPipe(CatalogKind)) kind: CatalogKind,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CatalogDetailDto> {
    const entry = await this.catalog.get(kind, id);
    response.setHeader('ETag', CatalogService.etag(entry));
    return entry;
  }

  @Patch(':kind/:id')
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOkResponse({ type: CatalogDetailDto })
  async update(
    @Req() request: RequestWithUser<SignedInAccount>,
    @Param('kind', new ParseEnumPipe(CatalogKind)) kind: CatalogKind,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() dto: CatalogInputDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CatalogDetailDto> {
    const entry = await this.catalog.update(
      request.user,
      kind,
      id,
      CatalogService.versionFromEtag(id, ifMatch),
      dto,
      request.correlationId,
    );
    response.setHeader('ETag', CatalogService.etag(entry));
    return entry;
  }

  @Post(':kind/:id/transitions')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CatalogDetailDto })
  async transition(
    @Req() request: RequestWithUser<SignedInAccount>,
    @Param('kind', new ParseEnumPipe(CatalogKind)) kind: CatalogKind,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CatalogTransitionDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CatalogDetailDto> {
    const entry = await this.catalog.transition(
      request.user,
      kind,
      id,
      dto,
      request.correlationId,
    );
    response.setHeader('ETag', CatalogService.etag(entry));
    return entry;
  }

  @Post(':kind/:id/merges')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({ type: CatalogMergeAcceptedDto })
  merge(
    @Req() request: RequestWithUser<SignedInAccount>,
    @Param('kind', new ParseEnumPipe(CatalogKind)) kind: CatalogKind,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CatalogMergeDto,
  ): Promise<CatalogMergeAcceptedDto> {
    return this.catalog.merge(
      request.user,
      kind,
      id,
      dto,
      request.correlationId,
    );
  }
}

@ApiTags('Catalog')
@Controller({ path: 'catalog', version: '1' })
export class PublicCatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get(':kind/:slug')
  @ApiOkResponse({ type: PublicCatalogDto })
  @ApiResponse({
    status: HttpStatus.PERMANENT_REDIRECT,
    description: 'Redirect to the canonical slug.',
  })
  async publicEntry(
    @Param('kind', new ParseEnumPipe(CatalogKind)) kind: CatalogKind,
    @Param('slug') slug: string,
    @Res() response: Response,
  ): Promise<void> {
    const resolution = await this.catalog.publicBySlug(kind, slug);
    if (resolution.redirectSlug) {
      response.redirect(
        HttpStatus.PERMANENT_REDIRECT,
        `/api/v1/catalog/${kind}/${resolution.redirectSlug}`,
      );
      return;
    }
    response.status(HttpStatus.OK).json(resolution.item);
  }
}

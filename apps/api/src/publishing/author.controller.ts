import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { isUUID } from 'class-validator';
import type { Response } from 'express';
import type { SignedInAccount } from '../auth/strategies/jwt.strategy';
import { CatalogService } from '../catalog/catalog.service';
import type { RequestWithUser } from '../utils/types/request-with-user.type';
import {
  CreateMaterialDto,
  MaterialTransition,
  SubmitAuthorMaterialDto,
  UpdateMaterialDraftDto,
  type MaterialDetailDto,
} from './dto/material.dto';
import { PublishingService } from './publishing.service';
import { SavedMaterialsService } from './saved-materials.service';

type AuthorRequest = RequestWithUser<SignedInAccount>;

enum CatalogField {
  Category = 'categoryIds',
  Topic = 'topicIds',
  Source = 'sourceIds',
  Place = 'placeIds',
}

@ApiTags('Authoring')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({ path: 'author', version: '1' })
export class AuthorController {
  constructor(
    private readonly publishing: PublishingService,
    private readonly catalog: CatalogService,
  ) {}

  @Get('catalog-options/:field')
  async options(
    @Param('field', new ParseEnumPipe(CatalogField)) field: CatalogField,
    @Query('q') query?: string,
    @Query('selected') selected?: string,
  ) {
    return {
      items: await this.catalog.authorOptions(
        field,
        typeof query === 'string' ? query : '',
        typeof selected === 'string'
          ? selected
              .slice(0, 3700)
              .split(',')
              .filter((id) => isUUID(id))
              .slice(0, 100)
          : [],
      ),
    };
  }

  @Get('materials')
  list(@Req() request: AuthorRequest) {
    return this.publishing.list(request.user, true);
  }

  @Post('materials')
  async create(
    @Req() request: AuthorRequest,
    @Body() dto: CreateMaterialDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const material = await this.publishing.create(
      request.user,
      dto,
      request.correlationId,
      true,
    );
    response.location(`/api/v1/author/materials/${material.id}`);
    return this.withEtag(response, material);
  }

  @Get('materials/:id')
  async get(
    @Req() request: AuthorRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.withEtag(
      response,
      await this.publishing.get(request.user, id, true),
    );
  }

  @Patch('materials/:id')
  async update(
    @Req() request: AuthorRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() dto: UpdateMaterialDraftDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (dto.mediaRefs !== undefined) {
      throw new UnprocessableEntityException({
        code: 'author_media_references_unsupported',
      });
    }
    const version = PublishingService.versionFromEtag(id, ifMatch);
    const material = await this.publishing.updateDraft(
      request.user,
      id,
      version,
      dto,
      request.correlationId,
      true,
    );
    return this.withEtag(response, material);
  }

  @Post('materials/:id/submissions')
  @HttpCode(200)
  async submit(
    @Req() request: AuthorRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitAuthorMaterialDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const material = await this.publishing.transition(
      request.user,
      id,
      {
        action: MaterialTransition.SubmitForReview,
        expectedVersion: dto.expectedVersion,
      },
      request.correlationId,
      true,
    );
    return this.withEtag(response, material);
  }

  private withEtag(response: Response, material: MaterialDetailDto) {
    response.setHeader('ETag', PublishingService.etag(material));
    return material;
  }
}

@ApiTags('Authoring')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller({ path: 'account/saved-materials', version: '1' })
export class SavedMaterialsController {
  constructor(private readonly saved: SavedMaterialsService) {}

  @Get()
  list(@Req() request: AuthorRequest) {
    return this.saved.list(request.user.profile.id);
  }

  @Put(':id')
  @HttpCode(204)
  async save(
    @Req() request: AuthorRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.saved.save(request.user.profile.id, id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Req() request: AuthorRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.saved.remove(request.user.profile.id, id);
  }
}

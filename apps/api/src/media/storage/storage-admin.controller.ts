import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
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
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import type { SignedInAccount } from '../../auth/strategies/jwt.strategy';
import { AdministratorGuard } from '../../back-office/administrator.guard';
import { BackOfficeGuard } from '../../back-office/back-office.guard';
import type { RequestWithUser } from '../../utils/types/request-with-user.type';
import { StorageAdminService } from './storage-admin.service';
import {
  CheckStorageConnectionDto,
  CreateStorageLocationDto,
  EditStorageLocationDto,
  StorageAssetIssuePageDto,
  StorageAssetIssueQueryDto,
  StorageConnectionProfilePageDto,
  StorageHealthDto,
  StorageLocationDetailDto,
  StorageLocationPageDto,
  StorageLocationQueryDto,
  StoragePageQueryDto,
  TransitionStorageLocationDto,
} from './storage.dto';

type Request = RequestWithUser<SignedInAccount>;
const uuid = new ParseUUIDPipe({ version: '7' });
const idempotencyKey = { name: 'Idempotency-Key', required: true };

@ApiTags('Admin storage')
@ApiBearerAuth()
@Controller({ path: 'admin/v1', version: VERSION_NEUTRAL })
@UseGuards(AuthGuard('jwt'), BackOfficeGuard, AdministratorGuard)
export class StorageAdminController {
  constructor(private readonly storage: StorageAdminService) {}

  @Get('storage-connection-profiles')
  @ApiOkResponse({ type: StorageConnectionProfilePageDto })
  profiles(
    @Query() query: StoragePageQueryDto,
  ): Promise<StorageConnectionProfilePageDto> {
    return this.storage.profiles(query);
  }

  @Get('storage-locations')
  @ApiOkResponse({ type: StorageLocationPageDto })
  list(
    @Query() query: StorageLocationQueryDto,
  ): Promise<StorageLocationPageDto> {
    return this.storage.list(query);
  }

  @Post('storage-locations')
  @ApiHeader(idempotencyKey)
  @ApiCreatedResponse({ type: StorageLocationDetailDto })
  async create(
    @Req() request: Request,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: CreateStorageLocationDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StorageLocationDetailDto> {
    const location = await this.storage.create(this.actor(request), key, body);
    response.setHeader(
      'Location',
      '/api/admin/v1/storage-locations/' + location.id,
    );
    return this.tag(response, location);
  }

  @Get('storage-locations/:id')
  @ApiOkResponse({ type: StorageLocationDetailDto })
  async detail(
    @Param('id', uuid) id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StorageLocationDetailDto> {
    return this.tag(response, await this.storage.detail(id));
  }

  @Patch('storage-locations/:id')
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiOkResponse({ type: StorageLocationDetailDto })
  async edit(
    @Req() request: Request,
    @Param('id', uuid) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: EditStorageLocationDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StorageLocationDetailDto> {
    return this.tag(
      response,
      await this.storage.edit(this.actor(request), id, ifMatch, body),
    );
  }

  @Get('storage-locations/:id/health')
  @ApiOkResponse({ type: StorageHealthDto })
  health(@Param('id', uuid) id: string): Promise<StorageHealthDto> {
    return this.storage.health(id);
  }

  @Get('storage-locations/:id/asset-issues')
  @ApiOkResponse({ type: StorageAssetIssuePageDto })
  issues(
    @Param('id', uuid) id: string,
    @Query() query: StorageAssetIssueQueryDto,
  ): Promise<StorageAssetIssuePageDto> {
    return this.storage.issues(id, query);
  }

  @Post('storage-locations/:id/connection-checks')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiHeader(idempotencyKey)
  @ApiOkResponse({ type: StorageHealthDto })
  check(
    @Req() request: Request,
    @Param('id', uuid) id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: CheckStorageConnectionDto,
  ): Promise<StorageHealthDto> {
    return this.storage.check(
      this.actor(request),
      id,
      key,
      body.expectedVersion,
    );
  }

  @Post('storage-locations/:id/transitions')
  @HttpCode(200)
  @ApiHeader(idempotencyKey)
  @ApiOkResponse({ type: StorageLocationDetailDto })
  async transition(
    @Req() request: Request,
    @Param('id', uuid) id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: TransitionStorageLocationDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StorageLocationDetailDto> {
    return this.tag(
      response,
      await this.storage.transition(this.actor(request), id, key, body),
    );
  }

  private actor(request: Request) {
    return { ...request.user, correlationId: request.correlationId };
  }

  private tag(
    response: Response,
    location: StorageLocationDetailDto,
  ): StorageLocationDetailDto {
    response.setHeader('ETag', this.storage.etag(location));
    return location;
  }
}

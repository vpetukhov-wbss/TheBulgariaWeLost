import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  Res,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { SignedInAccount } from '../auth/strategies/jwt.strategy';
import type { RequestWithUser } from '../utils/types/request-with-user.type';
import {
  AuthorizeReadRequestDto,
  CreateReadGrantDto,
  CreateUploadDto,
  GrantRequestDto,
  InspectionLeaseDto,
  InspectionResultDto,
  MediaAssetDto,
  ReadDecisionDto,
  ReadGrantDto,
  UploadClaimDto,
  UploadReceiptDto,
  UploadSessionDto,
} from './dto/media-upload.dto';
import { MediaServiceGuard } from './media-service.guard';
import { MediaService } from './media.service';

@ApiTags('Media')
@ApiBearerAuth()
@Controller({ path: 'media/uploads', version: '1' })
@UseGuards(AuthGuard('jwt'))
export class MediaUploadController {
  constructor(private readonly media: MediaService) {}

  @Post()
  @HttpCode(201)
  @ApiCreatedResponse({ type: UploadSessionDto })
  create(
    @Request() request: RequestWithUser<SignedInAccount>,
    @Body() dto: CreateUploadDto,
  ): Promise<UploadSessionDto> {
    return this.media.createUpload(
      request.user.profile.id,
      request.user.sessionId,
      dto,
    );
  }
}

@ApiTags('Media')
@ApiBearerAuth()
@Controller({ path: 'media/assets', version: '1' })
@UseGuards(AuthGuard('jwt'))
export class MediaAssetController {
  constructor(private readonly media: MediaService) {}

  @Get(':assetId')
  @ApiOkResponse({ type: MediaAssetDto })
  get(
    @Request() request: RequestWithUser<SignedInAccount>,
    @Param('assetId', new ParseUUIDPipe({ version: '7' })) assetId: string,
  ): Promise<MediaAssetDto> {
    return this.media.getAsset(request.user.profile.id, assetId);
  }

  @Post(':assetId/read-grants')
  @HttpCode(201)
  @ApiCreatedResponse({ type: ReadGrantDto })
  createReadGrant(
    @Request() request: RequestWithUser<SignedInAccount>,
    @Param('assetId', new ParseUUIDPipe({ version: '7' })) assetId: string,
    @Body() dto: CreateReadGrantDto,
  ): Promise<ReadGrantDto> {
    return this.media.createReadGrant(
      request.user.profile.id,
      request.user.sessionId,
      assetId,
      dto,
    );
  }
}

@ApiTags('Internal media')
@ApiBearerAuth('serviceToken')
@Controller({
  path: 'internal/media/v1/uploads',
  version: VERSION_NEUTRAL,
})
@UseGuards(MediaServiceGuard)
export class InternalMediaUploadController {
  constructor(private readonly media: MediaService) {}

  @Post(':uploadId/claim')
  @HttpCode(200)
  @ApiOkResponse({ type: UploadClaimDto })
  claim(
    @Param('uploadId', new ParseUUIDPipe({ version: '7' })) uploadId: string,
    @Body() dto: GrantRequestDto,
  ): Promise<UploadClaimDto> {
    return this.media.claimUpload(uploadId, dto.grant);
  }

  @Post(':uploadId/complete')
  @HttpCode(204)
  complete(
    @Param('uploadId', new ParseUUIDPipe({ version: '7' })) uploadId: string,
    @Body() dto: UploadReceiptDto,
  ): Promise<void> {
    return this.media.completeUpload(uploadId, dto);
  }
}

@ApiTags('Internal media')
@ApiBearerAuth('serviceToken')
@Controller({
  path: 'internal/media/v1/assets',
  version: VERSION_NEUTRAL,
})
@UseGuards(MediaServiceGuard)
export class InternalMediaAssetController {
  constructor(private readonly media: MediaService) {}

  @Post(':assetId/authorize-read')
  @HttpCode(200)
  @ApiOkResponse({ type: ReadDecisionDto })
  authorizeRead(
    @Param('assetId', new ParseUUIDPipe({ version: '7' })) assetId: string,
    @Body() dto: AuthorizeReadRequestDto,
  ): Promise<ReadDecisionDto> {
    return this.media.authorizeRead(assetId, dto);
  }
}

@ApiTags('Internal media')
@ApiBearerAuth('serviceToken')
@Controller({
  path: 'internal/media/v1/inspections',
  version: VERSION_NEUTRAL,
})
@UseGuards(MediaServiceGuard)
export class InternalMediaInspectionController {
  constructor(private readonly media: MediaService) {}

  @Post('lease')
  @HttpCode(200)
  @ApiOkResponse({ type: InspectionLeaseDto })
  @ApiNoContentResponse()
  async lease(
    @Res({ passthrough: true }) response: Response,
  ): Promise<InspectionLeaseDto | undefined> {
    const lease = await this.media.leaseInspection();
    if (lease) return lease;
    response.status(204);
    return undefined;
  }

  @Post(':jobId/complete')
  @HttpCode(204)
  complete(
    @Param('jobId', new ParseUUIDPipe({ version: '7' })) jobId: string,
    @Body() dto: InspectionResultDto,
  ): Promise<void> {
    return this.media.completeInspection(jobId, dto);
  }
}

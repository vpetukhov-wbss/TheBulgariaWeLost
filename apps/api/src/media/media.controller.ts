import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { SignedInAccount } from '../auth/strategies/jwt.strategy';
import type { RequestWithUser } from '../utils/types/request-with-user.type';
import {
  CreateUploadDto,
  GrantRequestDto,
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

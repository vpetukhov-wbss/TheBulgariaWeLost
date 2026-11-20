import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import {
  InternalMediaAssetController,
  InternalMediaInspectionController,
  InternalMediaUploadController,
  MediaAssetController,
  MediaUploadController,
} from './media.controller';
import { MediaServiceGuard } from './media-service.guard';
import { MediaService } from './media.service';
import { MediaQuota, MediaQuotaSchema } from './persistence/media-quota.schema';
import {
  MediaUpload,
  MediaUploadSchema,
} from './persistence/media-upload.schema';

@Module({
  imports: [
    AuthModule,
    JwtModule.register({}),
    MongooseModule.forFeature([
      { name: MediaUpload.name, schema: MediaUploadSchema },
      { name: MediaQuota.name, schema: MediaQuotaSchema },
    ]),
  ],
  controllers: [
    MediaUploadController,
    MediaAssetController,
    InternalMediaUploadController,
    InternalMediaAssetController,
    InternalMediaInspectionController,
  ],
  providers: [MediaService, MediaServiceGuard],
})
export class MediaModule {}

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { BackOfficeGuard } from '../back-office/back-office.guard';
import {
  MediaUpload,
  MediaUploadSchema,
} from '../media/persistence/media-upload.schema';
import {
  Material,
  MaterialRevision,
  MaterialRevisionSchema,
  MaterialSchema,
} from './persistence/material.schema';
import {
  PublishingAuditEvent,
  PublishingAuditEventSchema,
  PublishingOutboxEvent,
  PublishingOutboxEventSchema,
} from './persistence/publishing-event.schema';
import {
  PublicPublishingController,
  PublishingController,
} from './publishing.controller';
import { PublishingService } from './publishing.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Material.name, schema: MaterialSchema },
      { name: MaterialRevision.name, schema: MaterialRevisionSchema },
      { name: PublishingAuditEvent.name, schema: PublishingAuditEventSchema },
      {
        name: PublishingOutboxEvent.name,
        schema: PublishingOutboxEventSchema,
      },
      { name: MediaUpload.name, schema: MediaUploadSchema },
    ]),
  ],
  controllers: [PublishingController, PublicPublishingController],
  providers: [PublishingService, BackOfficeGuard],
})
export class PublishingModule {}

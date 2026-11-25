import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { BackOfficeGuard } from '../back-office/back-office.guard';
import { CatalogModule } from '../catalog/catalog.module';
import {
  AuthorController,
  SavedMaterialsController,
} from './author.controller';
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
import {
  SavedMaterial,
  SavedMaterialSchema,
} from './persistence/saved-material.schema';
import { SavedMaterialsService } from './saved-materials.service';

@Module({
  imports: [
    AuthModule,
    CatalogModule,
    MongooseModule.forFeature([
      { name: Material.name, schema: MaterialSchema },
      { name: MaterialRevision.name, schema: MaterialRevisionSchema },
      { name: SavedMaterial.name, schema: SavedMaterialSchema },
      { name: PublishingAuditEvent.name, schema: PublishingAuditEventSchema },
      {
        name: PublishingOutboxEvent.name,
        schema: PublishingOutboxEventSchema,
      },
      { name: MediaUpload.name, schema: MediaUploadSchema },
    ]),
  ],
  controllers: [
    PublishingController,
    PublicPublishingController,
    AuthorController,
    SavedMaterialsController,
  ],
  providers: [PublishingService, BackOfficeGuard, SavedMaterialsService],
  exports: [PublishingService],
})
export class PublishingModule {}

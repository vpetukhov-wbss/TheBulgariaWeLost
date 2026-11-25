import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { BackOfficeGuard } from '../back-office/back-office.guard';
import {
  PublishingAuditEvent,
  PublishingAuditEventSchema,
  PublishingOutboxEvent,
  PublishingOutboxEventSchema,
} from '../publishing/persistence/publishing-event.schema';
import {
  CatalogController,
  PublicCatalogController,
} from './catalog.controller';
import { CatalogService } from './catalog.service';
import {
  CatalogCollection,
  CatalogEntrySchema,
  CatalogKind,
  CatalogModelName,
} from './persistence/catalog.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      ...Object.values(CatalogKind).map((kind) => ({
        name: CatalogModelName[kind],
        schema: CatalogEntrySchema,
        collection: CatalogCollection[kind],
      })),
      { name: PublishingAuditEvent.name, schema: PublishingAuditEventSchema },
      {
        name: PublishingOutboxEvent.name,
        schema: PublishingOutboxEventSchema,
      },
    ]),
  ],
  controllers: [CatalogController, PublicCatalogController],
  providers: [CatalogService, BackOfficeGuard],
  exports: [CatalogService],
})
export class CatalogModule {}

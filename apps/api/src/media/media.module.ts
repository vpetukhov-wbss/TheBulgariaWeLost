import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { AdministratorGuard } from '../back-office/administrator.guard';
import { BackOfficeGuard } from '../back-office/back-office.guard';
import {
  PasswordResetOperation,
  PasswordResetOperationSchema,
} from '../back-office/persistence/password-reset-operation.schema';
import {
  MaterialRevision,
  MaterialRevisionSchema,
} from '../publishing/persistence/material.schema';
import {
  PublishingAuditEvent,
  PublishingAuditEventSchema,
} from '../publishing/persistence/publishing-event.schema';
import { AdminMediaController } from './admin/admin-media.controller';
import { AdminMediaService } from './admin/admin-media.service';
import {
  MediaAccessCommand,
  MediaAccessCommandSchema,
} from './admin/media-access-command.schema';
import { MediaLibraryScope } from './admin/media-library-scope.service';
import {
  InternalMediaAssetController,
  InternalMediaInspectionController,
  InternalMediaUploadController,
  MediaAssetController,
  MediaUploadController,
} from './media.controller';
import { MediaServiceGuard } from './media-service.guard';
import { MediaService } from './media.service';
import { AdminJobsService } from './operations/admin-jobs.service';
import { BackupOperationsService } from './operations/backup-operations.service';
import { BackupReporterGuard } from './operations/backup-reporter.guard';
import {
  BackupReporterController,
  OperationsController,
} from './operations/operations.controller';
import { OperationsStatusService } from './operations/operations-status.service';
import {
  BackupRun,
  BackupRunSchema,
  JobRetryCommand,
  JobRetryCommandSchema,
  MediaWorkerHeartbeat,
  MediaWorkerHeartbeatSchema,
} from './operations/operations.schema';
import { MediaQuota, MediaQuotaSchema } from './persistence/media-quota.schema';
import {
  MediaUpload,
  MediaUploadSchema,
} from './persistence/media-upload.schema';
import { StorageAdminController } from './storage/storage-admin.controller';
import { StorageAdminService } from './storage/storage-admin.service';
import { StorageProfileClient } from './storage/storage-profile-client';
import {
  StorageCommand,
  StorageCommandSchema,
  StorageRouting,
  StorageRoutingSchema,
} from './storage/storage-routing.schema';

@Module({
  imports: [
    AuthModule,
    JwtModule.register({}),
    MongooseModule.forFeature([
      { name: MediaUpload.name, schema: MediaUploadSchema },
      { name: MediaQuota.name, schema: MediaQuotaSchema },
      { name: MaterialRevision.name, schema: MaterialRevisionSchema },
      { name: PublishingAuditEvent.name, schema: PublishingAuditEventSchema },
      { name: MediaAccessCommand.name, schema: MediaAccessCommandSchema },
      {
        name: PasswordResetOperation.name,
        schema: PasswordResetOperationSchema,
      },
      { name: BackupRun.name, schema: BackupRunSchema },
      { name: JobRetryCommand.name, schema: JobRetryCommandSchema },
      { name: MediaWorkerHeartbeat.name, schema: MediaWorkerHeartbeatSchema },
      { name: StorageRouting.name, schema: StorageRoutingSchema },
      { name: StorageCommand.name, schema: StorageCommandSchema },
    ]),
  ],
  controllers: [
    AdminMediaController,
    OperationsController,
    BackupReporterController,
    StorageAdminController,
    MediaUploadController,
    MediaAssetController,
    InternalMediaUploadController,
    InternalMediaAssetController,
    InternalMediaInspectionController,
  ],
  providers: [
    MediaService,
    MediaServiceGuard,
    AdminMediaService,
    AdminJobsService,
    BackupOperationsService,
    BackupReporterGuard,
    OperationsStatusService,
    StorageAdminService,
    StorageProfileClient,
    MediaLibraryScope,
    BackOfficeGuard,
    AdministratorGuard,
  ],
})
export class MediaModule {}

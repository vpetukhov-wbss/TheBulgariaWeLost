import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { Account, AccountSchema } from '../auth/persistence/account.schema';
import { Session, SessionSchema } from '../auth/persistence/session.schema';
import {
  MediaUpload,
  MediaUploadSchema,
} from '../media/persistence/media-upload.schema';
import {
  ModerationCase,
  ModerationCaseSchema,
} from '../moderation/persistence/moderation.schema';
import {
  Material,
  MaterialSchema,
} from '../publishing/persistence/material.schema';
import {
  PublishingAuditEvent,
  PublishingAuditEventSchema,
  PublishingOutboxEvent,
  PublishingOutboxEventSchema,
} from '../publishing/persistence/publishing-event.schema';
import { AdminUserActionsService } from './admin-user-actions.service';
import {
  AdminUsersController,
  PasswordResetOperationsController,
} from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { AdministratorGuard } from './administrator.guard';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import {
  AuditAccessEvent,
  AuditAccessEventSchema,
} from './persistence/audit-access-event.schema';
import { BackOfficeController } from './back-office.controller';
import { BackOfficeGuard } from './back-office.guard';
import {
  AccountSanction,
  AccountSanctionSchema,
} from './persistence/account-sanction.schema';
import {
  AdminUserCommand,
  AdminUserCommandSchema,
} from './persistence/admin-user-command.schema';
import {
  AdministratorAccess,
  AdministratorAccessSchema,
} from './persistence/administrator-access.schema';
import {
  PasswordResetOperation,
  PasswordResetOperationSchema,
} from './persistence/password-reset-operation.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Account.name, schema: AccountSchema },
      { name: Session.name, schema: SessionSchema },
      { name: AuditAccessEvent.name, schema: AuditAccessEventSchema },
      { name: Material.name, schema: MaterialSchema },
      { name: ModerationCase.name, schema: ModerationCaseSchema },
      { name: MediaUpload.name, schema: MediaUploadSchema },
      { name: AccountSanction.name, schema: AccountSanctionSchema },
      { name: AdministratorAccess.name, schema: AdministratorAccessSchema },
      { name: AdminUserCommand.name, schema: AdminUserCommandSchema },
      {
        name: PasswordResetOperation.name,
        schema: PasswordResetOperationSchema,
      },
      { name: PublishingAuditEvent.name, schema: PublishingAuditEventSchema },
      { name: PublishingOutboxEvent.name, schema: PublishingOutboxEventSchema },
    ]),
  ],
  controllers: [
    BackOfficeController,
    AuditController,
    DashboardController,
    AdminUsersController,
    PasswordResetOperationsController,
  ],
  providers: [
    BackOfficeGuard,
    AuditService,
    DashboardService,
    AdministratorGuard,
    AdminUsersService,
    AdminUserActionsService,
  ],
})
export class BackOfficeModule {}

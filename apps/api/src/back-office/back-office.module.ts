import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { Account, AccountSchema } from '../auth/persistence/account.schema';
import { Session, SessionSchema } from '../auth/persistence/session.schema';
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
    AdminUsersController,
    PasswordResetOperationsController,
  ],
  providers: [
    BackOfficeGuard,
    AdministratorGuard,
    AdminUsersService,
    AdminUserActionsService,
  ],
})
export class BackOfficeModule {}

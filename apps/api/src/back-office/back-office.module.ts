import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { Account, AccountSchema } from '../auth/persistence/account.schema';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { AdministratorGuard } from './administrator.guard';
import { BackOfficeController } from './back-office.controller';
import { BackOfficeGuard } from './back-office.guard';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([{ name: Account.name, schema: AccountSchema }]),
  ],
  controllers: [BackOfficeController, AdminUsersController],
  providers: [BackOfficeGuard, AdministratorGuard, AdminUsersService],
})
export class BackOfficeModule {}

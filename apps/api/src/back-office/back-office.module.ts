import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BackOfficeController } from './back-office.controller';
import { BackOfficeGuard } from './back-office.guard';

@Module({
  imports: [AuthModule],
  controllers: [BackOfficeController],
  providers: [BackOfficeGuard],
})
export class BackOfficeModule {}

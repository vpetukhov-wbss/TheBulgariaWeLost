import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BackOfficeController } from './back-office.controller';

@Module({ imports: [AuthModule], controllers: [BackOfficeController] })
export class BackOfficeModule {}

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { BackOfficeGuard } from '../back-office/back-office.guard';
import {
  PublishingAuditEvent,
  PublishingAuditEventSchema,
} from '../publishing/persistence/publishing-event.schema';
import { PublishingModule } from '../publishing/publishing.module';
import {
  MaterialReportsController,
  ModerationController,
} from './moderation.controller';
import { ModerationService } from './moderation.service';
import {
  ModerationCase,
  ModerationCaseSchema,
  ModerationDecisionReceipt,
  ModerationDecisionReceiptSchema,
  ModerationReport,
  ModerationReportSchema,
} from './persistence/moderation.schema';

@Module({
  imports: [
    AuthModule,
    PublishingModule,
    MongooseModule.forFeature([
      { name: ModerationCase.name, schema: ModerationCaseSchema },
      { name: ModerationReport.name, schema: ModerationReportSchema },
      {
        name: ModerationDecisionReceipt.name,
        schema: ModerationDecisionReceiptSchema,
      },
      { name: PublishingAuditEvent.name, schema: PublishingAuditEventSchema },
    ]),
  ],
  controllers: [MaterialReportsController, ModerationController],
  providers: [ModerationService, BackOfficeGuard],
})
export class ModerationModule {}

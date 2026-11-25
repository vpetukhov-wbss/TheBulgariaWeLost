import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { activeSanctionFilter } from '../auth/account-access';
import { Account, Role } from '../auth/persistence/account.schema';
import {
  MediaAccessStatus,
  MediaUpload,
} from '../media/persistence/media-upload.schema';
import { ModerationStatus } from '../moderation/moderation.types';
import { ModerationCase } from '../moderation/persistence/moderation.schema';
import {
  Material,
  WorkingStatus,
} from '../publishing/persistence/material.schema';
import { PublishingAuditEvent } from '../publishing/persistence/publishing-event.schema';
import type {
  DashboardAdministrativeDto,
  DashboardSummaryDto,
} from './dashboard.dto';
import {
  PasswordResetOperation,
  ResetOperationStatus,
} from './persistence/password-reset-operation.schema';

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Material.name) private readonly materials: Model<Material>,
    @InjectModel(ModerationCase.name)
    private readonly cases: Model<ModerationCase>,
    @InjectModel(MediaUpload.name) private readonly uploads: Model<MediaUpload>,
    @InjectModel(Account.name) private readonly accounts: Model<Account>,
    @InjectModel(PasswordResetOperation.name)
    private readonly resets: Model<PasswordResetOperation>,
    @InjectModel(PublishingAuditEvent.name)
    private readonly audit: Model<PublishingAuditEvent>,
  ) {}

  async summary(role: Role): Promise<DashboardSummaryDto> {
    const now = new Date();
    const [
      submittedMaterials,
      materialsInReview,
      openModerationCases,
      restrictedMedia,
      administrative,
    ] = await Promise.all([
      this.materials
        .countDocuments({ workingStatus: WorkingStatus.Submitted })
        .exec(),
      this.materials
        .countDocuments({ workingStatus: WorkingStatus.InReview })
        .exec(),
      this.cases.countDocuments({ status: ModerationStatus.Open }).exec(),
      this.uploads
        .countDocuments({ accessStatus: MediaAccessStatus.Restricted })
        .exec(),
      role === Role.Administrator ? this.administrative(now) : undefined,
    ]);
    return {
      asOfUtc: now.toISOString(),
      submittedMaterials,
      materialsInReview,
      openModerationCases,
      restrictedMedia,
      ...(administrative ? { administrative } : {}),
    };
  }

  private async administrative(now: Date): Promise<DashboardAdministrativeDto> {
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const [
      bannedAccounts,
      failedPasswordResetsLast24Hours,
      auditEventsLast24Hours,
    ] = await Promise.all([
      this.accounts.countDocuments(activeSanctionFilter(now)).exec(),
      this.resets
        .countDocuments({
          status: ResetOperationStatus.Failed,
          finishedAt: { $gte: since },
        })
        .exec(),
      this.audit.countDocuments({ occurredAt: { $gte: since } }).exec(),
    ]);
    return {
      bannedAccounts,
      failedPasswordResetsLast24Hours,
      auditEventsLast24Hours,
    };
  }
}

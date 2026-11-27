import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AllConfigType } from '../../config/config.type';
import { StorageAdminService } from '../storage/storage-admin.service';
import { StorageConnectionStatus } from '../storage/storage.dto';
import { AdminJobsService } from './admin-jobs.service';
import { BackupOperationsService } from './backup-operations.service';
import type { OperationsSummaryDto } from './operations.dto';
import { BackupScope } from './operations.schema';

@Injectable()
export class OperationsStatusService {
  constructor(
    private readonly jobs: AdminJobsService,
    private readonly backups: BackupOperationsService,
    private readonly storage: StorageAdminService,
    private readonly config: ConfigService<AllConfigType>,
  ) {}

  async summary(): Promise<OperationsSummaryDto> {
    const now = new Date();
    const [telemetry, locations, mongo] = await Promise.all([
      this.jobs.telemetry(),
      this.storage.monitoredLocations(),
      this.backups.health(BackupScope.MongoDb),
    ]);
    const sftp = await Promise.all(
      locations.map((location) =>
        this.backups.health(BackupScope.SftpOriginals, location.id),
      ),
    );

    const backups = [mongo, ...sftp];
    const maxAgeHours = this.config.getOrThrow('media.backupMaxAgeHours', {
      infer: true,
    });
    const threshold = now.getTime() - maxAgeHours * 60 * 60_000;
    const alerts = [...telemetry.alerts];
    if (!telemetry.workers.some((worker) => worker.online)) {
      alerts.push({
        code: 'media_worker_unavailable',
        target: 'MediaInspection',
      });
    }
    for (const location of locations) {
      if (
        [
          StorageConnectionStatus.Denied,
          StorageConnectionStatus.Unavailable,
        ].includes(location.connectionStatus)
      ) {
        alerts.push({ code: 'storage_probe_failed', target: location.id });
      } else if (
        !location.checkedAt ||
        location.checkedAt.getTime() < now.getTime() - 24 * 60 * 60_000
      ) {
        alerts.push({ code: 'storage_probe_stale', target: location.id });
      }
    }
    for (const backup of backups) {
      const target = backup.storageLocationId ?? backup.scope;
      if (!backup.lastSuccessfulBackupAtUtc) {
        alerts.push({ code: 'backup_not_reported', target });
      } else if (Date.parse(backup.lastSuccessfulBackupAtUtc) < threshold) {
        alerts.push({ code: 'backup_overdue', target });
      }
    }
    return {
      measuredAtUtc: now.toISOString(),
      workers: telemetry.workers,
      backups,
      alerts,
    };
  }
}

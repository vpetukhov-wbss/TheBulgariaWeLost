import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NbAlertModule, NbButtonModule, NbCardModule, NbInputModule } from '@nebular/theme';
import type { BackupScope } from '../../api/generated/models/backup-scope';
import type { JobStatus } from '../../api/generated/models/job-status';
import type { JobType } from '../../api/generated/models/job-type';
import { OperationsStore } from './operations.store';

const statuses: Record<JobStatus, string> = {
  Queued: 'В опашката',
  Running: 'В процес',
  Succeeded: 'Успешно',
  Failed: 'Неуспешно',
};
const types: Record<JobType, string> = {
  MediaInspection: 'Проверка на медия',
  PasswordResetEmail: 'Имейл за ресет на парола',
};
const scopes: Record<BackupScope, string> = {
  MongoDb: 'MongoDB',
  SftpOriginals: 'SFTP оригинали',
};
const alertLabels: Partial<Record<string, string>> = {
  job_failed: 'Неуспешни задачи',
  job_lease_expired: 'Изтекло разрешение за обработка',
  media_worker_unavailable: 'Няма активен работник за медии',
  storage_probe_failed: 'Неуспешна проба на хранилище',
  storage_probe_stale: 'Липсва скорошна проба на хранилище',
  backup_not_reported: 'Липсва отчет за резервно копие',
  backup_overdue: 'Просрочено резервно копие',
};
const outcomes: Record<string, string> = {
  inspected: 'Проверено',
  missing: 'Липсващ оригинал',
  integrity_mismatch: 'Несъответствие на целостта',
  unsupported_format: 'Неподдържан формат',
  storage_unavailable: 'Недостъпно хранилище',
  inspection_timeout: 'Изтекло време за проверка',
  lease_expired: 'Изтекло разрешение за обработка',
  inspection_failed: 'Неуспешна проверка',
  password_reset_email_failed: 'Имейлът не е изпратен',
};

@Component({
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    NbAlertModule,
    NbButtonModule,
    NbCardModule,
    NbInputModule,
  ],
  providers: [OperationsStore],
  templateUrl: './operations-page.html',
  styleUrls: ['../editorial/editorial.scss', './operations-page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OperationsPage {
  protected readonly store = inject(OperationsStore);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, { requireSync: true });
  private readonly query = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly status = signal<JobStatus | undefined>(undefined);
  protected readonly type = signal<JobType | undefined>(undefined);
  protected readonly scope = signal<BackupScope | undefined>(undefined);
  protected readonly selection = computed(() => {
    const id = this.params().get('id');
    if (id) return { tab: 'detail' as const, id };
    return this.query().get('tab') === 'backups'
      ? { tab: 'backups' as const, scope: this.scope() }
      : { tab: 'jobs' as const, status: this.status(), type: this.type() };
  });
  protected readonly statuses = statuses;
  protected readonly types = types;
  protected readonly scopes = scopes;
  protected readonly alertLabels = alertLabels;
  protected readonly jobStatuses = Object.keys(statuses) as JobStatus[];
  protected readonly jobTypes = Object.keys(types) as JobType[];
  protected readonly backupScopes = Object.keys(scopes) as BackupScope[];
  protected readonly reason = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(500)],
  });

  constructor() {
    effect(() => {
      const selection = this.selection();
      untracked(() => this.store.select(selection));
    });
  }

  protected filterStatus(value: string): void {
    this.status.set(this.jobStatuses.find((status) => status === value));
  }

  protected filterType(value: string): void {
    this.type.set(this.jobTypes.find((type) => type === value));
  }

  protected filterScope(value: string): void {
    this.scope.set(this.backupScopes.find((scope) => scope === value));
  }

  protected async retry(event: Event): Promise<void> {
    event.preventDefault();
    const reason = this.reason.value.trim();
    if (reason && this.reason.valid && (await this.store.retry(reason))) this.reason.reset();
  }

  protected outcome(code?: string): string {
    return code ? (outcomes[code] ?? statuses[code as JobStatus] ?? code) : 'В процес';
  }

  protected labelForTarget(target: string): string {
    return types[target as JobType] ?? scopes[target as BackupScope] ?? target;
  }
}

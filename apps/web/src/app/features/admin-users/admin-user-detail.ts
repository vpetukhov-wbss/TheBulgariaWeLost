import { DatePipe, KeyValuePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NbAlertModule, NbButtonModule, NbCardModule, NbInputModule } from '@nebular/theme';
import { filter, map } from 'rxjs';
import { userRoles, userStatuses } from './admin-users-labels';
import { AdminUsersStore, type AdminUserCommand } from './admin-users.store';

const actionTitles: Record<AdminUserCommand['kind'], string> = {
  edit: 'Редакция на профила',
  role: 'Смяна на роля',
  ban: 'Блокиране на профила',
  unban: 'Отмяна на санкцията',
  sessions: 'Прекратяване на всички сесии',
  reset: 'Заявка за нова парола',
};

const operationStatuses = {
  Queued: 'На опашка',
  Running: 'Изпраща се',
  Succeeded: 'Линкът е изпратен.',
  Failed: 'Изпращането на линка не е потвърдено.',
};

@Component({
  imports: [
    DatePipe,
    KeyValuePipe,
    FormsModule,
    RouterLink,
    NbAlertModule,
    NbButtonModule,
    NbCardModule,
    NbInputModule,
  ],
  templateUrl: './admin-user-detail.html',
  styleUrl: '../editorial/editorial.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUserDetail {
  protected readonly store = inject(AdminUsersStore);
  private readonly route = inject(ActivatedRoute);
  protected readonly roles = userRoles;
  protected readonly statuses = userStatuses;
  protected readonly titles = actionTitles;
  protected readonly resetStatuses = operationStatuses;
  protected readonly selected = linkedSignal({
    source: () => this.store.detail()?.id,
    computation: (): AdminUserCommand['kind'] | null => null,
  });
  protected readonly displayName = linkedSignal(() => this.store.detail()?.displayName ?? '');
  protected readonly bio = linkedSignal(() => this.store.detail()?.bio ?? '');
  protected readonly role = linkedSignal(() => this.store.detail()?.role ?? 'User');
  protected readonly reason = signal('');
  protected readonly expiry = signal('');
  protected readonly permanent = signal(false);
  protected readonly formError = signal('');

  protected readonly canSubmit = computed(() => {
    const action = this.selected();
    if (!action || !this.store.canChange()) return false;
    if (action === 'edit') return !!this.store.etag() && !!this.displayName().trim();
    if (this.reason().trim().length < 3) return false;
    if (action === 'role') return this.role() !== this.store.detail()?.role;
    return action !== 'ban' || this.permanent() || !!this.expiry();
  });

  constructor() {
    this.store.loadDetail(
      this.route.paramMap.pipe(
        map((params) => params.get('id')),
        filter((id): id is string => id !== null),
        map((id) => ({ id })),
      ),
    );
  }

  protected retry(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.store.loadDetail({ id });
  }

  protected choose(action: AdminUserCommand['kind'] | null): void {
    this.selected.set(action);
    this.reason.set('');
    this.expiry.set('');
    this.permanent.set(false);
    this.formError.set('');
  }

  protected async submit(): Promise<void> {
    const kind = this.selected();
    if (!kind || !this.canSubmit()) return;
    const reason = this.reason().trim();
    this.formError.set('');

    let command: AdminUserCommand;
    if (kind === 'edit') {
      command = {
        kind,
        changes: { displayName: this.displayName().trim(), bio: this.bio().trim() },
      };
    } else if (kind === 'role') {
      command = { kind, role: this.role(), reason };
    } else if (kind === 'ban') {
      const expiry = this.permanent() ? null : new Date(this.expiry());
      if (expiry && (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now())) {
        this.formError.set('Посочи бъдеща дата и час на изтичане.');
        return;
      }
      command = { kind, expiresAtUtc: expiry?.toISOString() ?? null, reason };
    } else {
      command = { kind, reason };
    }
    if (await this.store.submit(command)) this.choose(null);
  }
}

import { DatePipe, KeyValuePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NbAlertModule, NbButtonModule, NbCardModule, NbInputModule } from '@nebular/theme';
import { isKey } from '../editorial/editorial-labels';
import { userRoles, userStatuses } from './admin-users-labels';
import { AdminUsersStore } from './admin-users.store';

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
  templateUrl: './admin-user-list.html',
  styleUrl: '../editorial/editorial.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUserList {
  protected readonly store = inject(AdminUsersStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });

  protected readonly roles = userRoles;
  protected readonly statuses = userStatuses;
  protected readonly email = signal('');
  private readonly appliedEmail = signal('');
  protected readonly filters = computed(() => {
    const role = this.params().get('role') ?? '';
    const status = this.params().get('status') ?? '';
    return {
      q: this.appliedEmail() || undefined,
      role: isKey(userRoles, role) ? role : undefined,
      status: isKey(userStatuses, status) ? status : undefined,
    };
  });
  protected readonly cursor = linkedSignal({
    source: this.filters,
    computation: (): string | undefined => undefined,
  });
  protected readonly request = computed(() => ({ ...this.filters(), cursor: this.cursor() }));

  constructor() {
    this.store.clearPage();
    this.store.loadPage(this.request);
  }

  protected search(): void {
    this.cursor.set(undefined);
    this.appliedEmail.set(this.email().trim());
  }

  protected filter(field: 'role' | 'status', value: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParamsHandling: 'merge',
      queryParams: { [field]: value || null },
    });
  }
}

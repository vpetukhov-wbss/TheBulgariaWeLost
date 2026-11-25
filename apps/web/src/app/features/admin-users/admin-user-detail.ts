import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NbAlertModule, NbButtonModule, NbCardModule } from '@nebular/theme';
import { filter, map } from 'rxjs';
import { userRoles, userStatuses } from './admin-users-labels';
import { AdminUsersStore } from './admin-users.store';

@Component({
  imports: [DatePipe, RouterLink, NbAlertModule, NbButtonModule, NbCardModule],
  templateUrl: './admin-user-detail.html',
  styleUrl: '../editorial/editorial.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUserDetail {
  protected readonly store = inject(AdminUsersStore);
  private readonly route = inject(ActivatedRoute);
  protected readonly roles = userRoles;
  protected readonly statuses = userStatuses;

  constructor() {
    this.store.loadDetail(
      this.route.paramMap.pipe(
        map((params) => params.get('id')),
        filter((id): id is string => id !== null),
      ),
    );
  }

  protected retry(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.store.loadDetail(id);
  }
}

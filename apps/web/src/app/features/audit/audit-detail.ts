import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NbAlertModule, NbButtonModule, NbCardModule } from '@nebular/theme';
import { userRoles } from '../admin-users/admin-users-labels';
import { auditAction, auditFields, auditOutcomes, auditTargets } from './audit-labels';
import { AuditStore } from './audit.store';

@Component({
  imports: [DatePipe, RouterLink, NbAlertModule, NbButtonModule, NbCardModule],
  templateUrl: './audit-detail.html',
  styleUrl: '../editorial/editorial.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditDetail {
  protected readonly store = inject(AuditStore);
  private readonly params = toSignal(inject(ActivatedRoute).paramMap, { requireSync: true });
  protected readonly id = computed(() => this.params().get('id') ?? '');
  protected readonly targets = auditTargets;
  protected readonly outcomes = auditOutcomes;
  protected readonly roles = userRoles;
  protected readonly actionLabel = auditAction;
  protected readonly fields = auditFields;

  constructor() {
    this.store.clearDetail();
    this.store.loadDetail(this.id);
  }
}

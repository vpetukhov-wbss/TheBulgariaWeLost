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
import { userRoles } from '../admin-users/admin-users-labels';
import { auditAction, auditOutcomes, auditTargets } from './audit-labels';
import { AuditStore } from './audit.store';

const emptyFilters = {
  actorId: '',
  action: '',
  targetType: '',
  targetId: '',
  outcome: '',
  fromUtc: '',
  toUtc: '',
};
type AuditFilters = typeof emptyFilters;

function localDate(utc: string | null): string {
  if (!utc) return '';
  const date = new Date(utc);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
}

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
  templateUrl: './audit-list.html',
  styleUrl: '../editorial/editorial.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditList {
  protected readonly store = inject(AuditStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly targets = auditTargets;
  protected readonly outcomes = auditOutcomes;
  protected readonly roles = userRoles;
  protected readonly actionLabel = auditAction;
  protected readonly filterError = signal('');
  protected readonly request = computed(() => {
    const query = this.params();
    const targetType = query.get('targetType') ?? '';
    const outcome = query.get('outcome') ?? '';
    return {
      actorId: query.get('actorId') || undefined,
      action: query.get('action') || undefined,
      targetType: isKey(auditTargets, targetType) ? targetType : undefined,
      targetId: query.get('targetId') || undefined,
      outcome: isKey(auditOutcomes, outcome) ? outcome : undefined,
      fromUtc: query.get('fromUtc') || undefined,
      toUtc: query.get('toUtc') || undefined,
      cursor: query.get('cursor') || undefined,
    };
  });
  protected readonly draft = linkedSignal<AuditFilters>(() => {
    const query = this.request();
    return {
      actorId: query.actorId ?? '',
      action: query.action ?? '',
      targetType: query.targetType ?? '',
      targetId: query.targetId ?? '',
      outcome: query.outcome ?? '',
      fromUtc: localDate(query.fromUtc ?? null),
      toUtc: localDate(query.toUtc ?? null),
    };
  });

  constructor() {
    this.store.clearPage();
    this.store.loadPage(this.request);
  }

  protected change(field: keyof AuditFilters, value: string): void {
    this.draft.update((draft) => ({ ...draft, [field]: value }));
    this.filterError.set('');
  }

  protected apply(): void {
    const filters = this.draft();
    const from = filters.fromUtc ? new Date(filters.fromUtc) : undefined;
    const to = filters.toUtc ? new Date(filters.toUtc) : undefined;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
      this.filterError.set('Въведи валидни дати.');
      return;
    }
    if (from && to && from >= to) {
      this.filterError.set('Краят на периода трябва да е след началото.');
      return;
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        actorId: filters.actorId.trim() || null,
        action: filters.action.trim() || null,
        targetType: filters.targetType || null,
        targetId: filters.targetId.trim() || null,
        outcome: filters.outcome || null,
        fromUtc: from?.toISOString() ?? null,
        toUtc: to?.toISOString() ?? null,
      },
    });
  }

  protected clear(): void {
    this.draft.set({ ...emptyFilters });
    this.filterError.set('');
    void this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }
}

import { DatePipe, KeyValuePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NbAlertModule, NbButtonModule, NbCardModule } from '@nebular/theme';
import { isKey } from '../editorial/editorial-labels';
import { casePriorities, caseStatuses, caseTypes } from './moderation-labels';
import { ModerationStore } from './moderation.store';

@Component({
  imports: [
    DatePipe,
    KeyValuePipe,
    FormsModule,
    RouterLink,
    NbAlertModule,
    NbButtonModule,
    NbCardModule,
  ],
  templateUrl: './moderation-queue.html',
  styleUrl: '../editorial/editorial.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModerationQueue {
  protected readonly store = inject(ModerationStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly statuses = caseStatuses;
  protected readonly priorities = casePriorities;
  protected readonly types = caseTypes;
  protected readonly filters = computed(() => {
    const status = this.params().get('status') ?? '';
    const priority = this.params().get('priority') ?? '';
    const caseType = this.params().get('caseType') ?? '';
    return {
      status: isKey(caseStatuses, status) ? status : undefined,
      priority: isKey(casePriorities, priority) ? priority : undefined,
      caseType: isKey(caseTypes, caseType) ? caseType : undefined,
    };
  });

  constructor() {
    this.store.loadQueue(this.filters);
  }

  protected filter(field: 'status' | 'priority' | 'caseType', value: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParamsHandling: 'merge',
      queryParams: { [field]: value || null },
    });
  }
}

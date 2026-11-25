import { DatePipe, KeyValuePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, linkedSignal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NbAlertModule, NbButtonModule, NbCardModule, NbInputModule } from '@nebular/theme';
import { filter, map } from 'rxjs';
import type { ModerationDecision } from '../../api/generated/models/moderation-decision';
import { publicStages } from '../editorial/editorial-labels';
import {
  casePriorities,
  caseStatuses,
  caseTypes,
  decisions,
  reportReasons,
} from './moderation-labels';
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
    NbInputModule,
  ],
  templateUrl: './moderation-detail.html',
  styleUrl: '../editorial/editorial.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModerationDetail {
  protected readonly store = inject(ModerationStore);
  private readonly route = inject(ActivatedRoute);
  protected readonly priorities = casePriorities;
  protected readonly statuses = caseStatuses;
  protected readonly types = caseTypes;
  protected readonly visibility = publicStages;
  protected readonly reasons = reportReasons;
  protected readonly actions = decisions;
  protected readonly priority = linkedSignal(() => this.store.detail()?.priority ?? 'Normal');
  protected readonly decision = linkedSignal({
    source: this.store.detail,
    computation: (): ModerationDecision | '' => '',
  });
  protected readonly reason = linkedSignal({ source: this.store.detail, computation: () => '' });

  constructor() {
    this.store.loadCase(
      this.route.paramMap.pipe(
        map((params) => params.get('id')),
        filter((id): id is string => id !== null),
      ),
    );
  }

  protected submit(): void {
    const decision = this.decision();
    if (decision) void this.store.decide(decision, this.reason());
  }
}

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NbIconModule } from '@nebular/theme';

export interface AdminMetric {
  readonly label: string;
  readonly value: number;
  readonly note: string;
  readonly icon: string;
  readonly path: string;
}

@Component({
  selector: 'app-admin-metric-card',
  imports: [RouterLink, NbIconModule],
  template: `
    @let metric = item();
    <a class="preview-metric-card" [routerLink]="metric.path">
      <span>{{ metric.label }} <nb-icon [icon]="metric.icon" aria-hidden="true" /></span>
      <strong>{{ metric.value }}</strong>
      <small>{{ metric.note }}</small>
    </a>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminMetricCard {
  readonly item = input.required<AdminMetric>();
}

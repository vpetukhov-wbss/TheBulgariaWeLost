import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NbAlertModule, NbButtonModule } from '@nebular/theme';
import { catchError, throwError } from 'rxjs';
import { DashboardService } from '../../api/generated/services/dashboard.service';
import { EditorialAccess } from '../editorial/editorial-access';

@Component({
  selector: 'app-dashboard-overview',
  imports: [DatePipe, RouterLink, NbAlertModule, NbButtonModule],
  templateUrl: './dashboard-overview.html',
  styleUrl: './dashboard-overview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardOverview {
  private readonly api = inject(DashboardService);
  private readonly access = inject(EditorialAccess);

  protected readonly summary = rxResource({
    stream: () =>
      this.api.getDashboardSummary().pipe(
        catchError((error: unknown) => {
          void this.access.redirectOnAccessError(error);
          return throwError(() => error);
        }),
      ),
  });
}

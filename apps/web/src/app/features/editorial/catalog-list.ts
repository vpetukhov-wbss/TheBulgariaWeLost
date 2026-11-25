import { DatePipe, KeyValuePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { NbAlertModule, NbButtonModule, NbCardModule, NbInputModule } from '@nebular/theme';
import { catchError, throwError } from 'rxjs';
import { CatalogService } from '../../api/generated/services/catalog.service';
import { catalogKinds, catalogStatuses } from './catalog-labels';
import { EditorialAccess } from './editorial-access';
import { isKey } from './editorial-labels';

@Component({
  imports: [
    DatePipe,
    KeyValuePipe,
    FormsModule,
    RouterLink,
    RouterLinkActive,
    NbAlertModule,
    NbButtonModule,
    NbCardModule,
    NbInputModule,
  ],
  templateUrl: './catalog-list.html',
  styleUrl: './editorial.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogList {
  private readonly api = inject(CatalogService);
  private readonly access = inject(EditorialAccess);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly routeParams = toSignal(this.route.paramMap, { requireSync: true });
  private readonly queryParams = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly kinds = catalogKinds;
  protected readonly kindEntries = Object.entries(catalogKinds);
  protected readonly statuses = catalogStatuses;
  protected readonly kind = computed(() => {
    const kind = this.routeParams().get('kind') ?? '';
    return isKey(catalogKinds, kind) ? kind : undefined;
  });
  protected readonly query = computed(() => this.queryParams().get('q')?.slice(0, 100) ?? '');
  protected readonly status = computed(() => {
    const status = this.queryParams().get('status') ?? '';
    return isKey(catalogStatuses, status) ? status : '';
  });
  protected readonly parent = computed(() =>
    this.kind() === 'categories' ? this.queryParams().get('parentId') : null,
  );
  protected readonly entries = rxResource({
    params: () => {
      const kind = this.kind();
      return kind
        ? {
            kind,
            q: this.query() || undefined,
            status: this.status() || undefined,
            parentId: this.parent() || undefined,
          }
        : undefined;
    },
    stream: ({ params }) =>
      this.api.listCatalogEntries(params).pipe(
        catchError((error: unknown) => {
          void this.access.redirectOnAccessError(error);
          return throwError(() => error);
        }),
      ),
  });

  protected apply(q: string, status: string, parentId = this.parent()): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: q.trim() || null, status: status || null, parentId },
    });
  }
}

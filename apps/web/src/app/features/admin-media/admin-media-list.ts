import { DatePipe, KeyValuePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NbAlertModule, NbButtonModule, NbCardModule, NbInputModule } from '@nebular/theme';
import { catchError, throwError } from 'rxjs';
import { AdminMediaService } from '../../api/generated/services/admin-media.service';
import { EditorialAccess } from '../editorial/editorial-access';
import { isKey } from '../editorial/editorial-labels';
import { mediaAccess, mediaProcessing, mediaRights, mediaTypes } from './media-labels';

const empty = { q: '', type: '', processingStatus: '', accessStatus: '', rightsStatus: '' };

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
  templateUrl: './admin-media-list.html',
  styleUrl: '../editorial/editorial.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminMediaList {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(AdminMediaService);
  private readonly access = inject(EditorialAccess);
  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly types = mediaTypes;
  protected readonly processing = mediaProcessing;
  protected readonly accessStatuses = mediaAccess;
  protected readonly rights = mediaRights;

  protected readonly filters = linkedSignal(() => {
    const query = this.params();
    return {
      q: query.get('q') ?? '',
      type: query.get('type') ?? '',
      processingStatus: query.get('processingStatus') ?? '',
      accessStatus: query.get('accessStatus') ?? '',
      rightsStatus: query.get('rightsStatus') ?? '',
    };
  });
  protected readonly fields: {
    field: Exclude<keyof typeof empty, 'q'>;
    label: string;
    options: Record<string, string>;
  }[] = [
    { field: 'type', label: 'Тип', options: mediaTypes },
    { field: 'processingStatus', label: 'Обработка', options: mediaProcessing },
    { field: 'accessStatus', label: 'Достъп', options: mediaAccess },
    { field: 'rightsStatus', label: 'Права', options: mediaRights },
  ];
  protected readonly cursor = computed(() => this.params().get('cursor'));
  protected readonly page = rxResource({
    params: () => {
      const query = this.params();
      const type = query.get('type') ?? '';
      const processingStatus = query.get('processingStatus') ?? '';
      const accessStatus = query.get('accessStatus') ?? '';
      const rightsStatus = query.get('rightsStatus') ?? '';
      return {
        q: query.get('q') || undefined,
        type: isKey(mediaTypes, type) ? type : undefined,
        processingStatus: isKey(mediaProcessing, processingStatus) ? processingStatus : undefined,
        accessStatus: isKey(mediaAccess, accessStatus) ? accessStatus : undefined,
        rightsStatus: isKey(mediaRights, rightsStatus) ? rightsStatus : undefined,
        cursor: this.cursor() || undefined,
      };
    },
    stream: ({ params }) =>
      this.api.listAdminMedia(params).pipe(
        catchError((error: unknown) => {
          void this.access.redirectOnAccessError(error);
          return throwError(() => error);
        }),
      ),
  });

  protected edit(field: keyof typeof empty, value: string): void {
    this.filters.update((filters) => ({ ...filters, [field]: value }));
  }

  protected search(): void {
    const query = this.filters();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: query.q.trim() || null,
        type: query.type || null,
        processingStatus: query.processingStatus || null,
        accessStatus: query.accessStatus || null,
        rightsStatus: query.rightsStatus || null,
      },
    });
  }

  protected clear(): void {
    this.filters.set({ ...empty });
    void this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }
}

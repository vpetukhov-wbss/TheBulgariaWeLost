import { HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import type { SiteSettings } from '../../api/generated/models/site-settings';
import type { UpdateSiteSettingsRequest } from '../../api/generated/models/update-site-settings-request';
import { AdminSiteSettingsService } from '../../api/generated/services/admin-site-settings.service';
import { problemCode } from '../../core/auth/auth-errors';
import { SitePresentationResource } from '../../core/site-presentation/site-presentation.resource';
import { EditorialAccess } from '../editorial/editorial-access';

interface SettingsState {
  current: { document: SiteSettings; etag: string } | null;
  busy: boolean;
  conflict: boolean;
  error: string;
}

const initialState: SettingsState = { current: null, busy: false, conflict: false, error: '' };

const messages: Record<string, string> = {
  site_link_invalid: 'Използвай вътрешен път, започващ с /, или пълен HTTPS адрес.',
  site_social_link_invalid:
    'Провери дали всеки HTTPS адрес води до канал на съответната платформа.',
  featured_material_unavailable: 'Поне един от избраните материали е недостъпен за посетителите.',
};

export const SiteSettingsStore = signalStore(
  withState(initialState),
  withMethods(
    (
      store,
      api = inject(AdminSiteSettingsService),
      access = inject(EditorialAccess),
      publicSite = inject(SitePresentationResource),
    ) => ({
      async load(): Promise<boolean> {
        if (store.busy()) return false;
        patchState(store, { busy: true, error: '' });
        try {
          const response = await firstValueFrom(api.getAdminSiteSettings$Response());
          const etag = response.headers.get('ETag');
          if (!etag) throw new Error('Missing settings ETag');
          patchState(store, { current: { document: response.body, etag }, conflict: false });
          return true;
        } catch (error: unknown) {
          if (!(await access.redirectOnAccessError(error))) {
            patchState(store, { error: 'Настройките са временно недостъпни.' });
          }
          return false;
        } finally {
          patchState(store, { busy: false });
        }
      },

      async save(body: UpdateSiteSettingsRequest): Promise<boolean> {
        const current = store.current();
        if (!current || store.busy() || store.conflict()) return false;
        patchState(store, { busy: true, error: '' });
        try {
          const response = await firstValueFrom(
            api.replaceAdminSiteSettings$Response({
              'If-Match': current.etag,
              body,
            }),
          );
          const etag = response.headers.get('ETag');
          if (!etag) throw new Error('Missing settings ETag');
          patchState(store, { current: { document: response.body, etag } });
          publicSite.refresh();
          return true;
        } catch (error: unknown) {
          if (error instanceof HttpErrorResponse && error.status === 412) {
            patchState(store, { conflict: true });
          } else if (!(await access.redirectOnAccessError(error))) {
            const code = problemCode(error);
            patchState(store, {
              error:
                messages[code ?? ''] ?? 'Записът е неуспешен. Провери стойностите и опитай отново.',
            });
          }
          return false;
        } finally {
          patchState(store, { busy: false });
        }
      },

      clearError(): void {
        patchState(store, { error: '' });
      },
    }),
  ),
);

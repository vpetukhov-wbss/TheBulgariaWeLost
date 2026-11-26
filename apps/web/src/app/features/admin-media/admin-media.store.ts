import { HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { EMPTY, catchError, firstValueFrom, forkJoin, pipe, switchMap, tap } from 'rxjs';
import type { AdminMediaDetail } from '../../api/generated/models/admin-media-detail';
import type { EditAdminMediaRequest } from '../../api/generated/models/edit-admin-media-request';
import type { MediaUsages } from '../../api/generated/models/media-usages';
import { AdminMediaService } from '../../api/generated/services/admin-media.service';
import { problemCode } from '../../core/auth/auth-errors';
import { EditorialAccess } from '../editorial/editorial-access';

interface MediaState {
  record: { asset: AdminMediaDetail; etag: string } | null;
  usages: MediaUsages | null;
  loading: boolean;
  busy: boolean;
  error: string;
  stale: boolean;
  notice: string;
}

const initial: MediaState = {
  record: null,
  usages: null,
  loading: true,
  busy: false,
  error: '',
  stale: false,
  notice: '',
};

export const AdminMediaStore = signalStore(
  withState(initial),
  withMethods((store, api = inject(AdminMediaService), access = inject(EditorialAccess)) => {
    async function actionError(error: unknown): Promise<void> {
      const code = problemCode(error);
      if (
        code === 'version_conflict' ||
        (error instanceof HttpErrorResponse && error.status === 412)
      ) {
        patchState(store, {
          stale: true,
          error: 'Файлът е променен. Зареди актуалния детайл, преди да запишеш отново.',
        });
      } else if (!(await access.redirectOnAccessError(error))) {
        patchState(store, { error: 'Промяната не е записана. Опитай отново след малко.' });
      }
    }

    return {
      load: rxMethod<string>(
        pipe(
          switchMap((id) => {
            patchState(store, { ...initial });
            return forkJoin({
              detail: api.getAdminMedia$Response({ id }),
              usages: api.getAdminMediaUsages({ id }),
            }).pipe(
              tap(({ detail, usages }) => {
                const etag = detail.headers.get('ETag');
                if (!etag) throw new Error('Missing media ETag');
                patchState(store, { record: { asset: detail.body, etag }, usages, loading: false });
              }),
              catchError((error: unknown) => {
                void access.redirectOnAccessError(error);
                patchState(store, { loading: false, error: 'Файлът е недостъпен.' });
                return EMPTY;
              }),
            );
          }),
        ),
      ),

      async edit(body: EditAdminMediaRequest): Promise<boolean> {
        const current = store.record();
        if (!current || !current.asset.canEdit || store.busy() || store.stale()) return false;
        patchState(store, { busy: true, error: '', notice: '' });
        try {
          const response = await firstValueFrom(
            api.editAdminMedia$Response({ id: current.asset.id, 'If-Match': current.etag, body }),
          );
          const etag = response.headers.get('ETag');
          if (!etag) throw new Error('Missing media ETag');
          patchState(store, {
            record: { asset: response.body, etag },
            notice: 'Метаданните са записани.',
          });
          return true;
        } catch (error: unknown) {
          await actionError(error);
          return false;
        } finally {
          patchState(store, { busy: false });
        }
      },

      async restrict(reason: string, key: string): Promise<boolean> {
        const current = store.record();
        if (!current || !current.asset.restrictionAction || store.busy() || store.stale())
          return false;
        patchState(store, { busy: true, error: '', notice: '' });
        try {
          const response = await firstValueFrom(
            api.changeAdminMediaRestriction$Response({
              id: current.asset.id,
              'Idempotency-Key': key,
              body: {
                reason,
                expectedVersion: current.asset.version,
                action: current.asset.restrictionAction,
              },
            }),
          );
          const etag = response.headers.get('ETag');
          if (!etag) throw new Error('Missing media ETag');
          patchState(store, {
            record: { asset: response.body, etag },
            notice:
              response.body.accessStatus === 'Restricted'
                ? 'Достъпът е ограничен.'
                : 'Ограничението е отменено.',
          });
          return true;
        } catch (error: unknown) {
          await actionError(error);
          return false;
        } finally {
          patchState(store, { busy: false });
        }
      },
    };
  }),
);

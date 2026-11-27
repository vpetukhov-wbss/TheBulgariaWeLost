import { HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom, type Observable } from 'rxjs';
import type { CreateStorageLocationRequest } from '../../api/generated/models/create-storage-location-request';
import type { EditStorageLocationRequest } from '../../api/generated/models/edit-storage-location-request';
import type { StorageAssetIssuePage } from '../../api/generated/models/storage-asset-issue-page';
import type { StorageConnectionProfile } from '../../api/generated/models/storage-connection-profile';
import type { StorageHealth } from '../../api/generated/models/storage-health';
import type { StorageLocationDetail } from '../../api/generated/models/storage-location-detail';
import type { StorageLocationPage } from '../../api/generated/models/storage-location-page';
import type { StorageLocationStatus } from '../../api/generated/models/storage-location-status';
import type { StorageTransition } from '../../api/generated/models/storage-transition';
import { AdminStorageService } from '../../api/generated/services/admin-storage.service';
import { problemCode } from '../../core/auth/auth-errors';
import { EditorialAccess } from '../editorial/editorial-access';

interface StorageState {
  locations: StorageLocationPage | null;
  profiles: StorageConnectionProfile[] | null;
  profilesError: string;
  detail: { value: StorageLocationDetail; etag: string } | null;
  health: StorageHealth | null;
  issues: StorageAssetIssuePage | null;
  active: string;
  busy: boolean;
  error: string;
  feedback: string;
  conflict: boolean;
}

const initial: StorageState = {
  locations: null,
  profiles: null,
  profilesError: '',
  detail: null,
  health: null,
  issues: null,
  active: '',
  busy: false,
  error: '',
  feedback: '',
  conflict: false,
};

const messages: Record<string, string> = {
  storage_location_not_found: 'Хранилището не е намерено.',
  storage_location_in_use: 'Хранилището вече се използва и не може да се архивира.',
  storage_location_immutable: 'Настройките на това хранилище са променени или заключени.',
  storage_profile_in_use: 'За този профил вече има хранилище.',
  storage_profile_unknown: 'Избраният профил вече не е достъпен.',
  storage_not_ready: 'Изпълни отново успешна проба, преди да активираш хранилището.',
  request_in_progress: 'Командата се обработва. Опитай отново след малко.',
};

export const StorageStore = signalStore(
  withState(initial),
  withMethods((store, api = inject(AdminStorageService), access = inject(EditorialAccess)) => {
    let scope = 0;
    let pendingCommand: { action: string; key: string } | undefined;

    const commandKey = (operation: string, ...inputs: unknown[]) => {
      const action = JSON.stringify([operation, ...inputs]);
      if (pendingCommand?.action !== action) {
        pendingCommand = { action, key: crypto.randomUUID() };
      }
      return pendingCommand.key;
    };

    const readDetail = async (id: string) => {
      const [response, health, issues, active] = await Promise.all([
        firstValueFrom(api.getStorageLocation$Response({ id })),
        firstValueFrom(api.getStorageHealth({ id })),
        firstValueFrom(api.listStorageAssetIssues({ id })),
        firstValueFrom(api.listStorageLocations({ status: 'ActiveForNewWrites', limit: 1 })),
      ]);
      const etag = response.headers.get('ETag');
      if (!etag) throw new Error('Missing storage ETag');
      return {
        detail: { value: response.body, etag },
        health,
        issues,
        active: active.items[0]?.label ?? '',
      };
    };

    const report = async (error: unknown, fallback: string, current: number) => {
      if (current !== scope || (await access.redirectOnAccessError(error)) || current !== scope)
        return;
      const code = problemCode(error) ?? '';
      const conflict =
        error instanceof HttpErrorResponse &&
        (error.status === 412 ||
          code === 'routing_version_conflict' ||
          code === 'version_conflict');
      patchState(store, { conflict, error: conflict ? '' : (messages[code] ?? fallback) });
    };

    const run = async <T>(
      work: () => Promise<T>,
      apply: (value: T) => void,
      fallback: string,
    ): Promise<boolean> => {
      if (store.busy()) return false;
      const current = scope;
      patchState(store, { busy: true, error: '', feedback: '' });
      try {
        const value = await work();
        if (current !== scope) return false;
        apply(value);
        return true;
      } catch (error: unknown) {
        await report(error, fallback, current);
        return false;
      } finally {
        if (current === scope) patchState(store, { busy: false });
      }
    };

    const updateDetail = async <T>(
      response: Observable<T>,
      id: string,
      feedback: string,
    ): Promise<boolean> =>
      run(
        async () => {
          await firstValueFrom(response);
          pendingCommand = undefined;
          return readDetail(id);
        },
        (data) => patchState(store, { ...data, feedback, conflict: false }),
        'Промяната не е потвърдена. Презареди хранилището, за да провериш състоянието.',
      );

    return {
      open(id: string): void {
        scope++;
        patchState(store, initial);
        void run<Partial<StorageState>>(
          () =>
            id
              ? readDetail(id)
              : firstValueFrom(api.listStorageLocations()).then((locations) => ({ locations })),
          (data) => patchState(store, data),
          'Хранилищата са временно недостъпни.',
        );
      },

      async loadLocations(status?: StorageLocationStatus, more = false): Promise<boolean> {
        const previous = more ? store.locations() : null;
        return run(
          () => firstValueFrom(api.listStorageLocations({ status, cursor: previous?.nextCursor })),
          (page) =>
            patchState(store, {
              locations: { ...page, items: [...(previous?.items ?? []), ...page.items] },
            }),
          'Списъкът с хранилища е временно недостъпен.',
        );
      },

      async loadProfiles(): Promise<void> {
        if (store.profiles() !== null) return;
        const current = scope;
        try {
          const profiles: StorageConnectionProfile[] = [];
          let cursor: string | undefined;
          do {
            const page = await firstValueFrom(
              api.listStorageConnectionProfiles({ limit: 100, cursor }),
            );
            profiles.push(...page.items);
            cursor = page.nextCursor;
          } while (cursor && current === scope);
          if (current === scope) patchState(store, { profiles, profilesError: '' });
        } catch (error: unknown) {
          if (current === scope && !(await access.redirectOnAccessError(error))) {
            patchState(store, { profilesError: 'SFTP профилите са временно недостъпни.' });
          }
        }
      },

      async create(body: CreateStorageLocationRequest): Promise<StorageLocationDetail | null> {
        let created: StorageLocationDetail | null = null;
        await run(
          () =>
            firstValueFrom(
              api.createStorageLocation({
                body,
                'Idempotency-Key': commandKey('create', body),
              }),
            ),
          (value) => {
            created = value;
            pendingCommand = undefined;
          },
          'Черновата не е създадена.',
        );
        return created;
      },

      edit(body: EditStorageLocationRequest): Promise<boolean> {
        const detail = store.detail();
        if (!detail || store.conflict()) return Promise.resolve(false);
        return updateDetail(
          api.editStorageLocation({ id: detail.value.id, body, 'If-Match': detail.etag }),
          detail.value.id,
          'Хранилището е обновено.',
        );
      },

      probe(): Promise<boolean> {
        const detail = store.detail()?.value;
        if (!detail || store.conflict()) return Promise.resolve(false);
        return updateDetail(
          api.checkStorageConnection({
            id: detail.id,
            'Idempotency-Key': commandKey('probe', detail.id, detail.version),
            body: { expectedVersion: detail.version },
          }),
          detail.id,
          'Пробата приключи. Резултатът е в „Състояние“.',
        );
      },

      transition(action: StorageTransition, reason: string): Promise<boolean> {
        const detail = store.detail()?.value;
        if (!detail || store.conflict()) return Promise.resolve(false);
        const body = {
          action,
          reason,
          expectedVersion: detail.version,
          ...(action === 'ActivateForNewWrites'
            ? { expectedRoutingVersion: detail.routingVersion }
            : {}),
        };
        return updateDetail(
          api.transitionStorageLocation({
            id: detail.id,
            'Idempotency-Key': commandKey('transition', detail.id, body),
            body,
          }),
          detail.id,
          action === 'ArchiveDraft'
            ? 'Черновата е архивирана.'
            : 'Новите качвания вече използват това хранилище.',
        );
      },

      async moreIssues(): Promise<boolean> {
        const id = store.detail()?.value.id;
        const previous = store.issues();
        if (!id || !previous?.nextCursor) return false;
        return run(
          () => firstValueFrom(api.listStorageAssetIssues({ id, cursor: previous.nextCursor })),
          (page) =>
            patchState(store, { issues: { ...page, items: [...previous.items, ...page.items] } }),
          'Справката за проблемни файлове е временно недостъпна.',
        );
      },
    };
  }),
);

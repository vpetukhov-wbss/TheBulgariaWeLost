import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { EMPTY, catchError, firstValueFrom, forkJoin, pipe, switchMap, tap } from 'rxjs';
import type { ListAdminUsers$Params } from '../../api/generated/fn/admin-users/list-admin-users';
import type { AccountSanction } from '../../api/generated/models/account-sanction';
import type { AdminPasswordResetOperation } from '../../api/generated/models/admin-password-reset-operation';
import type { AdminUserDetail } from '../../api/generated/models/admin-user-detail';
import type { AdminUserPage } from '../../api/generated/models/admin-user-page';
import type { EditAdminUserRequest } from '../../api/generated/models/edit-admin-user-request';
import { AdminUsersService } from '../../api/generated/services/admin-users.service';
import { actionError, problemCode } from '../../core/auth/auth-errors';
import { EditorialAccess } from '../editorial/editorial-access';

interface AdminUsersState {
  page: AdminUserPage | null;
  loadingPage: boolean;
  pageError: string;
  detail: AdminUserDetail | null;
  loadingDetail: boolean;
  detailError: string;
  activeId: string;
  etag: string | null;
  history: AccountSanction[];
  historyCursor: string | null;
  historyLoading: boolean;
  historyError: string;
  busy: boolean;
  stale: boolean;
  actionError: string;
  notice: string;
  resetId: string | null;
  resetOperation: AdminPasswordResetOperation | null;
  resetChecking: boolean;
  resetError: string;
}

export type AdminUserCommand =
  | { kind: 'edit'; changes: EditAdminUserRequest }
  | { kind: 'role'; reason: string; role: AdminUserDetail['role'] }
  | { kind: 'ban'; reason: string; expiresAtUtc: string | null }
  | { kind: 'unban' | 'sessions' | 'reset'; reason: string };

type DetailRequest = { id: string; keepFeedback?: boolean };

const initialState: AdminUsersState = {
  page: null,
  loadingPage: true,
  pageError: '',
  detail: null,
  loadingDetail: true,
  detailError: '',
  activeId: '',
  etag: null,
  history: [],
  historyCursor: null,
  historyLoading: false,
  historyError: '',
  busy: false,
  stale: false,
  actionError: '',
  notice: '',
  resetId: null,
  resetOperation: null,
  resetChecking: false,
  resetError: '',
};

const failures: Record<string, string> = {
  last_active_admin: 'Трябва да остане поне един активен администратор.',
  self_management_forbidden: 'Промяната на собствената роля или санкция е недопустима.',
  sanction_already_active: 'Профилът вече има активна санкция.',
  sanction_inactive: 'Санкцията вече е изтекла или е отменена.',
  sanction_expiry_invalid: 'Посочи бъдеща дата и час на изтичане.',
  role_unchanged: 'Избраната роля вече е активна.',
  account_recovery_unavailable: 'Възстановяването е достъпно за активен профил без санкция.',
  password_reset_rate_limited: 'Достигнат е лимитът за ресет на парола. Опитай по-късно.',
};

const notices: Record<AdminUserCommand['kind'], string> = {
  edit: 'Профилът е обновен.',
  role: 'Ролята е сменена и предишните сесии са прекратени.',
  ban: 'Санкцията е приложена и предишните сесии са прекратени.',
  unban: 'Санкцията е отменена.',
  sessions: 'Сесиите са прекратени.',
  reset: 'Заявката за линк за нова парола е приета.',
};

export const AdminUsersStore = signalStore(
  withState(initialState),
  withComputed(({ detail, busy, stale, loadingDetail }) => ({
    canChange: computed(() => !!detail() && !busy() && !stale() && !loadingDetail()),
  })),
  withMethods((store, api = inject(AdminUsersService), access = inject(EditorialAccess)) => {
    let pending: { signature: string; key: string } | undefined;

    const loadDetail = rxMethod<DetailRequest>(
      pipe(
        tap(({ id, keepFeedback }) =>
          patchState(store, {
            activeId: id,
            loadingDetail: true,
            detailError: '',
            detail: null,
            etag: null,
            history: [],
            historyCursor: null,
            historyError: '',
            stale: false,
            ...(keepFeedback
              ? {}
              : {
                  notice: '',
                  actionError: '',
                  resetId: null,
                  resetOperation: null,
                  resetError: '',
                }),
          }),
        ),
        switchMap(({ id }) =>
          forkJoin({
            profile: api.getAdminUser$Response({ id }),
            history: api.listAccountSanctions({ id }),
          }).pipe(
            tap(({ profile, history }) =>
              patchState(store, {
                detail: profile.body,
                etag: profile.headers.get('ETag'),
                history: history.items,
                historyCursor: history.nextCursor ?? null,
                loadingDetail: false,
              }),
            ),
            catchError((error: unknown) => {
              void access.redirectOnAccessError(error);
              const detailError =
                problemCode(error) === 'account_not_found'
                  ? 'Профилът не е намерен.'
                  : actionError(error, 'Профилът и историята не можаха да се заредят.');
              patchState(store, { detailError, loadingDetail: false });
              return EMPTY;
            }),
          ),
        ),
      ),
    );

    async function checkResetStatus(): Promise<void> {
      const id = store.resetId();
      if (!id || store.resetChecking()) return;
      patchState(store, { resetChecking: true, resetError: '' });
      try {
        const operation = await firstValueFrom(api.getPasswordResetOperation({ id }));
        if (store.resetId() === id) patchState(store, { resetOperation: operation });
      } catch (error: unknown) {
        if (store.resetId() === id) {
          void access.redirectOnAccessError(error);
          patchState(store, {
            resetError: actionError(error, 'Статусът на заявката е недостъпен.'),
          });
        }
      } finally {
        patchState(store, { resetChecking: false });
      }
    }

    return {
      clearPage(): void {
        patchState(store, { page: null, loadingPage: true, pageError: '' });
      },
      loadPage: rxMethod<ListAdminUsers$Params>(
        pipe(
          tap(() => patchState(store, { loadingPage: true, pageError: '', page: null })),
          switchMap((filters) =>
            api.listAdminUsers(filters).pipe(
              tap((page) => patchState(store, { page, loadingPage: false })),
              catchError((error: unknown) => {
                void access.redirectOnAccessError(error);
                const code = problemCode(error);
                const pageError =
                  code === 'invalid_user_search'
                    ? 'За търсене въведи пълен имейл адрес.'
                    : actionError(error, 'Списъкът с потребители е недостъпен.');
                patchState(store, { pageError, loadingPage: false });
                return EMPTY;
              }),
            ),
          ),
        ),
      ),
      loadDetail,
      checkResetStatus,
      async loadMoreHistory(): Promise<void> {
        const id = store.activeId();
        const cursor = store.historyCursor();
        if (!cursor || store.historyLoading()) return;
        patchState(store, { historyLoading: true, historyError: '' });
        try {
          const page = await firstValueFrom(api.listAccountSanctions({ id, cursor }));
          if (store.activeId() === id && store.historyCursor() === cursor) {
            patchState(store, {
              history: [...store.history(), ...page.items],
              historyCursor: page.nextCursor ?? null,
            });
          }
        } catch (error: unknown) {
          if (store.activeId() === id) {
            void access.redirectOnAccessError(error);
            patchState(store, {
              historyError: actionError(error, 'Историята не можа да се зареди.'),
            });
          }
        } finally {
          patchState(store, { historyLoading: false });
        }
      },
      async submit(command: AdminUserCommand): Promise<boolean> {
        const user = store.detail();
        const etag = store.etag();
        if (!user || !store.canChange()) return false;
        if (command.kind === 'edit' ? !etag : command.reason.trim().length < 3) return false;

        const { id, version } = user;
        const signature = JSON.stringify([id, version, command]);
        if (pending?.signature !== signature) pending = { signature, key: crypto.randomUUID() };
        const params = { id, 'Idempotency-Key': pending.key };
        patchState(store, { busy: true, actionError: '', notice: '' });
        try {
          let resetId: string | null = null;
          if (command.kind === 'edit') {
            await firstValueFrom(
              api.editAdminUser({ id, 'If-Match': etag!, body: command.changes }),
            );
          } else {
            const body = { reason: command.reason.trim(), expectedVersion: version };
            switch (command.kind) {
              case 'role':
                await firstValueFrom(
                  api.changeAdminUserRole({ ...params, body: { ...body, role: command.role } }),
                );
                break;
              case 'ban':
                await firstValueFrom(
                  api.banAdminUser({
                    ...params,
                    body: { ...body, expiresAtUtc: command.expiresAtUtc },
                  }),
                );
                break;
              case 'unban':
                if (!user.activeSanction) return false;
                await firstValueFrom(
                  api.unbanAdminUser({ ...params, sanctionId: user.activeSanction.id, body }),
                );
                break;
              case 'sessions':
                await firstValueFrom(api.revokeAdminUserSessions({ ...params, body }));
                break;
              case 'reset': {
                const operation = await firstValueFrom(
                  api.requestAdminPasswordReset({ ...params, body }),
                );
                resetId = operation.operationId;
                break;
              }
            }
          }
          pending = undefined;
          if (store.activeId() === id) {
            patchState(store, {
              notice: notices[command.kind],
              ...(resetId ? { resetId, resetOperation: null, resetError: '' } : {}),
            });
            loadDetail({ id, keepFeedback: true });
            if (resetId) void checkResetStatus();
          }
          return true;
        } catch (error: unknown) {
          if (store.activeId() !== id) return false;
          const code = problemCode(error) ?? '';
          if (
            code === 'version_conflict' ||
            (error instanceof HttpErrorResponse && error.status === 412)
          ) {
            patchState(store, {
              stale: true,
              actionError: 'Профилът е променен. Зареди актуалната версия.',
            });
          } else {
            void access.redirectOnAccessError(error);
            patchState(store, {
              actionError: Object.hasOwn(failures, code)
                ? failures[code]
                : actionError(error, 'Промяната не можа да се изпълни.'),
            });
          }
          return false;
        } finally {
          patchState(store, { busy: false });
        }
      },
    };
  }),
);

import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { EMPTY, catchError, pipe, switchMap, tap } from 'rxjs';
import type { ListAdminUsers$Params } from '../../api/generated/fn/back-office/list-admin-users';
import type { AdminUserDetail } from '../../api/generated/models/admin-user-detail';
import type { AdminUserPage } from '../../api/generated/models/admin-user-page';
import { BackOfficeService } from '../../api/generated/services/back-office.service';
import { actionError, problemCode } from '../../core/auth/auth-errors';
import { EditorialAccess } from '../editorial/editorial-access';

interface AdminUsersState {
  page: AdminUserPage | null;
  loadingPage: boolean;
  pageError: string;
  detail: AdminUserDetail | null;
  loadingDetail: boolean;
  detailError: string;
}

const initialState: AdminUsersState = {
  page: null,
  loadingPage: true,
  pageError: '',
  detail: null,
  loadingDetail: true,
  detailError: '',
};

export const AdminUsersStore = signalStore(
  withState(initialState),
  withMethods((store, api = inject(BackOfficeService), access = inject(EditorialAccess)) => ({
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
    loadDetail: rxMethod<string>(
      pipe(
        tap(() => patchState(store, { loadingDetail: true, detailError: '', detail: null })),
        switchMap((id) =>
          api.getAdminUser({ id }).pipe(
            tap((detail) => patchState(store, { detail, loadingDetail: false })),
            catchError((error: unknown) => {
              void access.redirectOnAccessError(error);
              const detailError =
                problemCode(error) === 'account_not_found'
                  ? 'Профилът не е намерен.'
                  : actionError(error, 'Профилът не можа да се зареди.');
              patchState(store, { detailError, loadingDetail: false });
              return EMPTY;
            }),
          ),
        ),
      ),
    ),
  })),
);

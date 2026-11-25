import { HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { EMPTY, catchError, pipe, switchMap, tap } from 'rxjs';
import type { ListAuditEvents$Params } from '../../api/generated/fn/audit/list-audit-events';
import type { AuditEventDetail } from '../../api/generated/models/audit-event-detail';
import type { AuditEventPage } from '../../api/generated/models/audit-event-page';
import { AuditService } from '../../api/generated/services/audit.service';
import { problemCode } from '../../core/auth/auth-errors';
import { EditorialAccess } from '../editorial/editorial-access';

type AuditResult<T> =
  { kind: 'loading' } | { kind: 'loaded'; value: T } | { kind: 'error'; message: string };

interface AuditState {
  page: AuditResult<AuditEventPage>;
  detail: AuditResult<AuditEventDetail>;
}

const initialState: AuditState = { page: { kind: 'loading' }, detail: { kind: 'loading' } };

export const AuditStore = signalStore(
  withState(initialState),
  withMethods((store, api = inject(AuditService), access = inject(EditorialAccess)) => ({
    clearPage: () => patchState(store, { page: { kind: 'loading' } }),
    clearDetail: () => patchState(store, { detail: { kind: 'loading' } }),
    loadPage: rxMethod<ListAuditEvents$Params>(
      pipe(
        switchMap((query) => {
          patchState(store, { page: { kind: 'loading' } });
          return api.listAuditEvents(query).pipe(
            tap((value) => patchState(store, { page: { kind: 'loaded', value } })),
            catchError((error: unknown) => {
              void access.redirectOnAccessError(error);
              const code = problemCode(error);
              const message =
                code === 'invalid_cursor'
                  ? 'Страницата е невалидна. Върни се в началото на журнала.'
                  : code === 'invalid_date_range'
                    ? 'Краят на периода трябва да е след началото.'
                    : error instanceof HttpErrorResponse && [400, 422].includes(error.status)
                      ? 'Провери ID, действие и дати във филтрите.'
                      : 'Журналът е временно недостъпен.';
              patchState(store, { page: { kind: 'error', message } });
              return EMPTY;
            }),
          );
        }),
      ),
    ),
    loadDetail: rxMethod<string>(
      pipe(
        switchMap((id) => {
          patchState(store, { detail: { kind: 'loading' } });
          return api.getAuditEvent({ id }).pipe(
            tap((value) => patchState(store, { detail: { kind: 'loaded', value } })),
            catchError((error: unknown) => {
              void access.redirectOnAccessError(error);
              const message =
                error instanceof HttpErrorResponse && [400, 404].includes(error.status)
                  ? 'Събитието не е намерено.'
                  : 'Събитието е временно недостъпно.';
              patchState(store, { detail: { kind: 'error', message } });
              return EMPTY;
            }),
          );
        }),
      ),
    ),
  })),
);

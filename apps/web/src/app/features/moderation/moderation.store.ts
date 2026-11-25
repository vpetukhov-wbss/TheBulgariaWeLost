import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { EMPTY, catchError, firstValueFrom, forkJoin, pipe, switchMap, tap } from 'rxjs';
import type { ListModerationCases$Params } from '../../api/generated/fn/moderation/list-moderation-cases';
import type { DecideModerationCaseRequest } from '../../api/generated/models/decide-moderation-case-request';
import type { ModerationCaseDetail } from '../../api/generated/models/moderation-case-detail';
import type { ModerationCaseSummary } from '../../api/generated/models/moderation-case-summary';
import type { ModerationDecision } from '../../api/generated/models/moderation-decision';
import type { ModerationPriority } from '../../api/generated/models/moderation-priority';
import type { ModerationReport } from '../../api/generated/models/moderation-report';
import { ModerationService } from '../../api/generated/services/moderation.service';
import type { StrictHttpResponse } from '../../api/generated/strict-http-response';
import { actionError, problemCode } from '../../core/auth/auth-errors';
import { EditorialAccess } from '../editorial/editorial-access';

type QueueFilters = Pick<ListModerationCases$Params, 'caseType' | 'status' | 'priority'>;

interface ModerationState {
  queue: ModerationCaseSummary[];
  queueLoading: boolean;
  queueError: string;
  detail: ModerationCaseDetail | null;
  reports: ModerationReport[];
  activeId: string;
  etag: string | null;
  loading: boolean;
  busy: boolean;
  stale: boolean;
  error: string;
  notice: string;
}

const initialState: ModerationState = {
  queue: [],
  queueLoading: true,
  queueError: '',
  detail: null,
  reports: [],
  activeId: '',
  etag: null,
  loading: true,
  busy: false,
  stale: false,
  error: '',
  notice: '',
};

const failureMessages: Record<string, string> = {
  moderation_case_assigned: 'Друг редактор е поел този сигнал.',
  moderation_decision_forbidden: 'Текущата ти роля или назначение не позволява това решение.',
  invalid_moderation_decision: 'Сигналът вече не допуска избраното решение.',
  publication_rights_missing: 'Материалът не може да се върне без валидни права за публикуване.',
  rights_review_pending: 'По материала има неприключил сигнал за оспорени права.',
  request_in_progress: 'Заявката още се обработва. Можеш да я повториш със същите данни.',
};

export const ModerationStore = signalStore(
  withState(initialState),
  withComputed(({ detail, busy, loading, stale }) => ({
    canChange: computed(() => !!detail() && !busy() && !loading() && !stale()),
  })),
  withMethods((store, api = inject(ModerationService), access = inject(EditorialAccess)) => {
    let retry: { signature: string; key: string } | undefined;

    function fail(error: unknown, fallback: string): void {
      const code = problemCode(error) ?? '';
      if (
        code === 'version_conflict' ||
        (error instanceof HttpErrorResponse && error.status === 412)
      ) {
        patchState(store, {
          stale: true,
          error: 'Случаят или материалът е променен. Зареди актуалната версия.',
        });
      } else if (Object.hasOwn(failureMessages, code)) {
        patchState(store, { error: failureMessages[code] });
      } else {
        void access.redirectOnAccessError(error);
        patchState(store, { error: actionError(error, fallback) });
      }
    }

    function apply(result: StrictHttpResponse<ModerationCaseDetail>): void {
      patchState(store, { detail: result.body, etag: result.headers.get('ETag'), stale: false });
    }

    async function perform(
      id: string,
      send: () => Promise<StrictHttpResponse<ModerationCaseDetail>>,
      notice: string,
    ): Promise<void> {
      patchState(store, { busy: true, notice: '', error: '' });
      try {
        const result = await send();
        if (store.activeId() === id) {
          apply(result);
          patchState(store, { notice });
        }
      } catch (error: unknown) {
        if (store.activeId() === id) fail(error, 'Действието не можа да се изпълни.');
      } finally {
        patchState(store, { busy: false });
      }
    }

    return {
      loadQueue: rxMethod<QueueFilters>(
        pipe(
          tap(() => patchState(store, { queueLoading: true, queueError: '' })),
          switchMap((filters) =>
            api.listModerationCases(filters).pipe(
              tap(({ items }) => patchState(store, { queue: items, queueLoading: false })),
              catchError((error: unknown) => {
                void access.redirectOnAccessError(error);
                patchState(store, {
                  queue: [],
                  queueLoading: false,
                  queueError: actionError(error, 'Опашката не можа да се зареди.'),
                });
                return EMPTY;
              }),
            ),
          ),
        ),
      ),
      loadCase: rxMethod<string>(
        pipe(
          tap((id) =>
            patchState(store, {
              ...(store.activeId() !== id
                ? { detail: null, reports: [], etag: null, stale: false }
                : {}),
              activeId: id,
              loading: true,
              error: '',
              notice: '',
            }),
          ),
          switchMap((id) =>
            forkJoin({
              detail: api.getModerationCase$Response({ id }),
              reports: api.listModerationReports({ id }),
            }).pipe(
              tap(({ detail, reports }) => {
                apply(detail);
                patchState(store, { reports: reports.items, loading: false });
              }),
              catchError((error: unknown) => {
                fail(error, 'Случаят и доказателствата не можаха да се заредят.');
                patchState(store, { loading: false, stale: true });
                return EMPTY;
              }),
            ),
          ),
        ),
      ),
      async take(priority: ModerationPriority): Promise<void> {
        const detail = store.detail();
        const tag = store.etag();
        if (!detail?.canTake || !tag || !store.canChange()) return;
        await perform(
          detail.id,
          () =>
            firstValueFrom(
              api.takeModerationCase$Response({
                id: detail.id,
                'If-Match': tag,
                body: { priority },
              }),
            ),
          'Приоритетът и отговорникът са записани.',
        );
      },
      async decide(decision: ModerationDecision, reason: string): Promise<void> {
        const detail = store.detail();
        const trimmed = reason.trim();
        if (
          !detail ||
          !store.canChange() ||
          trimmed.length < 3 ||
          !detail.allowedDecisions.includes(decision)
        )
          return;
        const body: DecideModerationCaseRequest = {
          decision,
          reason: trimmed,
          expectedVersion: detail.version,
          ...(decision === 'Dismiss' ? {} : { targetExpectedVersion: detail.target.version }),
        };
        const signature = JSON.stringify([detail.id, body]);
        if (retry?.signature !== signature) retry = { signature, key: crypto.randomUUID() };
        const key = retry.key;
        await perform(
          detail.id,
          async () => {
            const result = await firstValueFrom(
              api.decideModerationCase$Response({ id: detail.id, 'Idempotency-Key': key, body }),
            );
            retry = undefined;
            return result;
          },
          'Решението е записано.',
        );
      },
    };
  }),
);

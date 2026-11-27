import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import type { BackupPage } from '../../api/generated/models/backup-page';
import type { BackupScope } from '../../api/generated/models/backup-scope';
import type { JobDetail } from '../../api/generated/models/job-detail';
import type { JobPage } from '../../api/generated/models/job-page';
import type { JobStatus } from '../../api/generated/models/job-status';
import type { JobType } from '../../api/generated/models/job-type';
import type { OperationsSummary } from '../../api/generated/models/operations-summary';
import { AdminOperationsService } from '../../api/generated/services/admin-operations.service';
import { problemCode } from '../../core/auth/auth-errors';
import { EditorialAccess } from '../editorial/editorial-access';

type Selection =
  | { tab: 'jobs'; status?: JobStatus; type?: JobType }
  | { tab: 'backups'; scope?: BackupScope }
  | { tab: 'detail'; id: string };

interface OperationsState {
  summary: OperationsSummary | null;
  jobs: JobPage | null;
  backups: BackupPage | null;
  job: JobDetail | null;
  busy: boolean;
  error: string;
  notice: string;
}

const initialState: OperationsState = {
  summary: null,
  jobs: null,
  backups: null,
  job: null,
  busy: false,
  error: '',
  notice: '',
};

const failures: Record<string, string> = {
  job_not_found: 'Задачата не е намерена.',
  version_conflict: 'Задачата се е променила. Обнови статуса и прегледай последния опит.',
  job_retry_not_allowed: 'Тази задача вече няма допустим повторен опит.',
};

export const OperationsStore = signalStore(
  withState(initialState),
  withMethods((store, api = inject(AdminOperationsService), access = inject(EditorialAccess)) => {
    let generation = 0;
    let command: { signature: string; key: string } | undefined;

    const loadPage = async (
      selection: Selection,
      more: boolean,
    ): Promise<Partial<OperationsState>> => {
      if (selection.tab === 'detail') {
        return { job: await firstValueFrom(api.getAdminJob({ id: selection.id })) };
      }
      if (selection.tab === 'jobs') {
        const previous = more ? store.jobs() : null;
        const page = await firstValueFrom(
          api.listAdminJobs({
            type: selection.type,
            status: selection.status,
            cursor: previous?.nextCursor,
          }),
        );
        return { jobs: { ...page, items: [...(previous?.items ?? []), ...page.items] } };
      }
      const previous = more ? store.backups() : null;
      const page = await firstValueFrom(
        api.listBackupRuns({
          scope: selection.scope,
          cursor: previous?.nextCursor,
        }),
      );
      return { backups: { ...page, items: [...(previous?.items ?? []), ...page.items] } };
    };

    const run = async (work: () => Promise<Partial<OperationsState>>, fallback: string) => {
      if (store.busy()) return false;
      const current = generation;
      patchState(store, { busy: true, error: '', notice: '' });
      try {
        const next = await work();
        if (generation !== current) return false;
        patchState(store, next);
        return true;
      } catch (error: unknown) {
        if (
          generation === current &&
          !(await access.redirectOnAccessError(error)) &&
          generation === current
        ) {
          patchState(store, { error: failures[problemCode(error) ?? ''] ?? fallback });
        }
        return false;
      } finally {
        if (generation === current) patchState(store, { busy: false });
      }
    };

    return {
      select(selection: Selection): void {
        generation++;
        patchState(store, { ...initialState, summary: store.summary() });
        void run(async () => {
          if (selection.tab === 'detail') return loadPage(selection, false);
          const [summary, page] = await Promise.all([
            firstValueFrom(api.getOperationsSummary()),
            loadPage(selection, false),
          ]);
          return { summary, ...page };
        }, 'Оперативните данни са временно недостъпни.');
      },

      more(selection: Selection): Promise<boolean> {
        return run(() => loadPage(selection, true), 'Следващата страница е временно недостъпна.');
      },

      retry(reason: string): Promise<boolean> {
        const job = store.job();
        if (!job?.canRetry) return Promise.resolve(false);
        const body = { expectedVersion: job.version, reason };
        return run(async () => {
          const signature = JSON.stringify([job.id, body]);
          if (command?.signature !== signature) command = { signature, key: crypto.randomUUID() };
          await firstValueFrom(
            api.retryAdminJob({ id: job.id, 'Idempotency-Key': command.key, body }),
          );
          command = undefined;
          return {
            job: await firstValueFrom(api.getAdminJob({ id: job.id })),
            notice: 'Задачата е върната в опашката.',
          };
        }, 'Заявката не е потвърдена. Обнови статуса, преди да опиташ отново.');
      },
    };
  }),
);

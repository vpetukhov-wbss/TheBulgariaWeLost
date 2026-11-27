import { expect, test, type Page } from '@playwright/test';
import type { JobDetail } from '../src/app/api/generated/models/job-detail';
import type { OperationsSummary } from '../src/app/api/generated/models/operations-summary';

const root = '/api/admin/v1/jobs';
const id = '019a9451-2b60-7000-8000-000000000975';
const timestamp = '2026-11-27T08:00:00.000Z';
const summary: OperationsSummary = {
  measuredAtUtc: timestamp,
  workers: [{ id: '442a82cf-2163-4128-bf1a-fe985348d1c1', lastSeenAtUtc: timestamp, online: true }],
  backups: [
    {
      scope: 'MongoDb',
      lastSuccessfulBackupAtUtc: '2026-11-25T01:00:00.000Z',
      lastVerificationAtUtc: '2026-11-25T01:20:00.000Z',
      lastVerifiedRestoreAtUtc: '2026-11-25T02:30:00.000Z',
    },
    { scope: 'SftpOriginals' },
  ],
  alerts: [{ code: 'backup_overdue', target: 'MongoDb' }],
};

async function signIn(
  page: Page,
  role: 'Administrator' | 'Editor',
  returnTo = '/admin/operations',
) {
  const administrator = role === 'Administrator';
  const user = {
    id: '019a9451-2b60-7000-8000-000000000976',
    role,
    email: 'operator@example.test',
    firstName: 'Мария',
    lastName: 'Иванова',
    mfaEnabled: administrator,
  };
  let job: JobDetail = {
    id,
    targetId: id,
    status: 'Failed',
    type: 'MediaInspection',
    version: 3,
    attemptCount: 1,
    updatedAtUtc: timestamp,
    traceId: 'media-original',
    canRetry: true,
    lastErrorCode: 'storage_unavailable',
    attempts: [{ id: user.id, startedAtUtc: timestamp, outcome: 'storage_unavailable' }],
  };
  let calls = 0;
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/v1/auth/email/login') {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
      return route.fulfill({
        json: {
          token: [
            encode({ alg: 'HS256', typ: 'JWT' }),
            encode({ id: user.id, role, exp }),
            'test',
          ].join('.'),
          refreshToken: 'fixture',
          tokenExpires: exp * 1000,
          user,
        },
      });
    }
    if (url.pathname === '/api/v1/auth/me') return route.fulfill({ json: user });
    if (url.pathname === '/api/admin/v1/me') {
      return route.fulfill({
        json: {
          id: user.id,
          role,
          displayName: 'Мария Иванова',
          permissions: ['BackOffice.Access', ...(administrator ? ['Operations.Manage'] : [])],
          ...(administrator ? { mfaVerifiedAtUtc: new Date().toISOString() } : {}),
        },
      });
    }
    if (url.pathname === '/api/admin/v1/operations-summary') {
      calls++;
      return route.fulfill({ json: summary });
    }
    if (url.pathname === '/api/admin/v1/backups') {
      calls++;
      return route.fulfill({
        json: {
          items:
            url.searchParams.get('scope') === 'SftpOriginals'
              ? []
              : [
                  {
                    id,
                    scope: 'MongoDb',
                    status: 'Succeeded',
                    startedAtUtc: timestamp,
                    traceId: 'nightly-mongo',
                  },
                ],
        },
      });
    }
    if (url.pathname === root) {
      calls++;
      return route.fulfill({ json: { items: [job] } });
    }
    if (url.pathname === root + '/' + id) return route.fulfill({ json: job });
    if (url.pathname === root + '/' + id + '/retries') {
      expect(request.headers()['idempotency-key']).toBeTruthy();
      expect(request.postDataJSON()).toEqual({ expectedVersion: 3, reason: 'SFTP работи отново' });
      job = {
        ...job,
        status: 'Queued',
        version: 4,
        canRetry: false,
        lastErrorCode: undefined,
        lastRetryTraceId: 'media-retry',
      };
      return route.fulfill({ status: 202, json: { operationId: id, statusUrl: root + '/' + id } });
    }
    return route.fulfill({ status: 404, json: { code: 'not_found' } });
  });

  await page.goto('/login?returnTo=' + encodeURIComponent(returnTo));
  await page.getByLabel('Имейл').fill(user.email);
  await page.getByLabel('Парола', { exact: true }).fill(crypto.randomUUID());
  await page.getByRole('button', { name: 'Влез', exact: true }).click();
  return () => calls;
}

test('administrator sees workers and can retry an eligible job once', async ({ page }) => {
  await signIn(page, 'Administrator');
  await expect(page.getByText('Активен', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Проверка на медия' }).click();
  await expect(page.getByText('media-original', { exact: true })).toBeVisible();
  const retry = page.getByRole('button', { name: 'Повтори задачата' });
  await expect(retry).toBeDisabled();
  await page.getByLabel('Причина за повторението').fill('SFTP работи отново');
  await retry.click();
  await expect(page.getByText('Задачата е върната в опашката.')).toBeVisible();
  await expect(page.getByText('В опашката', { exact: true })).toBeVisible();
  await expect(page.getByText('media-retry', { exact: true })).toBeVisible();
  await expect(retry).toHaveCount(0);
});

test('shows separate backup, verification and restore timestamps', async ({ page }) => {
  await signIn(page, 'Administrator', '/admin/operations?tab=backups');
  const table = page.getByRole('table', { name: 'Състояние на резервните копия' });
  const row = table.getByRole('row').filter({ hasText: 'MongoDB' });
  await expect(row.getByRole('cell')).toHaveCount(4);
  await expect(row).not.toContainText('Няма отчет');
  await expect(table.getByRole('columnheader', { name: 'Тестово възстановяване' })).toBeVisible();
  await expect(page.getByText('Просрочено резервно копие · MongoDB')).toBeVisible();
  await page.getByRole('combobox', { name: 'Обхват' }).selectOption('SftpOriginals');
  await expect(page.getByText('Няма отчетени изпълнения за този обхват.')).toBeVisible();
});

test('editor cannot access the operations screens', async ({ page }) => {
  const calls = await signIn(page, 'Editor');
  await expect(page).toHaveURL(/\/forbidden$/);
  await page.goto('/admin/operations/jobs/' + id);
  await expect(page).toHaveURL(/\/forbidden$/);
  expect(calls()).toBe(0);
});

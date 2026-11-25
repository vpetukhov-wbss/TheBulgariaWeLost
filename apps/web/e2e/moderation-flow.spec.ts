import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { ModerationCaseDetail } from '../src/app/api/generated/models/moderation-case-detail';

const title = 'Снимка от стария град';
const slug = 'snimka-ot-stariya-grad';
const materialId = '019a9451-2b60-7000-8000-000000000601';
const caseId = '019a9451-2b60-7000-8000-000000000602';
const editorId = '019a9451-2b60-7000-8000-000000000603';
const reportId = '019a9451-2b60-7000-8000-000000000604';
const material = '/api/v1/materials/' + slug;
const queue = '/api/admin/v1/moderation-cases';
const date = '2026-06-01T12:00:00Z';

async function login(page: Page): Promise<void> {
  const role = 'Editor';
  const user = {
    id: editorId,
    role,
    email: 'editor@example.test',
    firstName: 'Ралица',
    lastName: 'Иванова',
    mfaEnabled: false,
  };
  await page.route('**/api/v1/auth/**', (route) => {
    if (route.request().url().endsWith('/email/login')) {
      const exp = Math.floor(Date.now() / 1000) + 3_600;
      const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
      const token = [
        encode({ alg: 'HS256', typ: 'JWT' }),
        encode({ id: editorId, role, exp }),
        'test-signature',
      ].join('.');
      return route.fulfill({
        json: { token, refreshToken: 'test-refresh', tokenExpires: exp * 1000, user },
      });
    }
    return route.fulfill({ json: user });
  });
  await page.route('**/api/admin/v1/me', (route) =>
    route.fulfill({
      json: {
        id: editorId,
        role,
        displayName: 'Ралица Иванова',
        permissions: ['BackOffice.Access', 'Editorial.Manage'],
      },
    }),
  );
  await page.goto('/login');
  await page.getByLabel('Имейл').fill(user.email);
  await page.getByLabel('Парола').fill('moderation-test-' + Date.now());
  await page.getByRole('button', { name: 'Влез' }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test('retries a public report with the same key and without bearer credentials', async ({
  page,
}) => {
  const keys: string[] = [];
  await page.route('**' + material, (route) =>
    route.fulfill({
      json: {
        id: materialId,
        slug,
        type: 'Story',
        language: 'bg',
        revisionNumber: 2,
        content: { title, body: 'Архивен разказ.' },
      },
    }),
  );
  await page.route('**' + material + '/reports', (route) => {
    const request = route.request();
    expect(request.headers()['authorization']).toBeUndefined();
    expect(request.postDataJSON()).toEqual({
      reasonCode: 'Copyright',
      description: 'Липсва посочен автор.',
    });
    keys.push(request.headers()['idempotency-key']);
    return keys.length === 1
      ? route.fulfill({ status: 503, json: { code: 'unavailable' } })
      : route.fulfill({ status: 202 });
  });
  await login(page);
  await page.goto('/materials/' + slug);
  await page.getByRole('button', { name: 'Подай сигнал' }).click();
  await page.getByLabel('Причина за сигнала').selectOption('Copyright');
  await page.getByLabel('Описание (по желание)').fill('Липсва посочен автор.');
  const submit = page.getByRole('button', { name: 'Изпрати сигнала' });
  await submit.click();
  await expect(page.getByRole('alert')).toBeVisible();
  await submit.click();
  await expect(page.getByText('Сигналът е приет за редакторски преглед.')).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/i);
  expect(keys[1]).toBe(keys[0]);
});

test('preserves the queue filter and submits a decision against the current case and material', async ({
  page,
}) => {
  const current: ModerationCaseDetail = {
    id: caseId,
    targetId: materialId,
    title,
    caseType: 'Rights',
    priority: 'High',
    status: 'Open',
    reportCount: 1,
    version: 1,
    createdAtUtc: date,
    updatedAtUtc: date,
    canTake: true,
    target: { slug, status: 'Published', version: 5, publicVisibility: true },
    allowedDecisions: [],
  };
  const reason = 'Правата за показване се проверяват.';
  const etag = () => '"moderation-' + caseId + '-v' + current.version + '"';
  await page.route('**' + queue + '**', (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname === queue) {
      expect(url.searchParams.get('priority')).toBe('High');
      return route.fulfill({ json: { items: [current] } });
    }
    if (url.pathname.endsWith('/reports')) {
      return route.fulfill({
        json: {
          items: [
            {
              id: reportId,
              reasonCode: 'Copyright',
              description: 'Липсва посочен автор.',
              evidenceUrl: 'https://archive.example.org/source',
              revisionNumber: 2,
              createdAtUtc: date,
            },
          ],
        },
      });
    }
    if (req.method() === 'PATCH') {
      expect(req.headers()['if-match']).toBe(etag());
      expect(req.postDataJSON()).toEqual({ priority: 'High' });
      current.version = 2;
      current.status = 'UnderReview';
      current.assigneeId = editorId;
      current.allowedDecisions = ['Dismiss', 'RequestCorrection', 'WithdrawMaterial'];
    }
    if (url.pathname.endsWith('/decisions')) {
      expect(req.headers()['idempotency-key']).toBeTruthy();
      expect(req.postDataJSON()).toEqual({
        decision: 'WithdrawMaterial',
        reason,
        expectedVersion: 2,
        targetExpectedVersion: 5,
      });
      current.version = 3;
      current.status = 'Resolved';
      current.target = {
        ...current.target,
        status: 'Withdrawn',
        version: 6,
        publicVisibility: false,
      };
      current.resolution = { decision: 'WithdrawMaterial', reason, decidedAtUtc: date };
      current.withdrawal = current.resolution;
      current.canTake = false;
      current.allowedDecisions = [];
    }
    return route.fulfill({ json: current, headers: { etag: etag() } });
  });
  await login(page);
  await page.goto('/admin/moderation?priority=High');
  await page.getByRole('link', { name: title }).click();
  await expect(page.getByText('Липсва посочен автор.')).toBeVisible();
  await expect(
    page.getByText('https://archive.example.org/source', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Поеми за преглед' }).click();
  await page.getByLabel('Редакторско действие').selectOption('WithdrawMaterial');
  await page.getByLabel('Причина за решението').fill(reason);
  await page.getByRole('button', { name: 'Потвърди решението' }).click();
  await expect(page.getByText('Решението е записано.')).toBeVisible();
  await expect(
    page.getByText('Възстановяването при спор за права изисква администратор.'),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Сигнали за съдържание' }).last().click();
  await expect(page).toHaveURL(/\/admin\/moderation\?priority=High$/);
  await expect(page.getByLabel('Приоритет')).toHaveValue('High');
});

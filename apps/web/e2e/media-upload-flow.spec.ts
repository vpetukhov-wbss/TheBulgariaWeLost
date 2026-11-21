import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const accountId = '019a9451-2b60-7000-8000-000000000101';
const sessionId = '019a9451-2b60-7000-8000-000000000102';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF', 'utf8');

function jwt(payload: Record<string, unknown>): string {
  const encoded = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encoded({ alg: 'HS256', typ: 'JWT' })}.${encoded(payload)}.test-signature`;
}

function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

interface MediaMockOptions {
  contentType: 'image/png' | 'application/pdf';
  failFirstUpload?: boolean;
  restrictPreview?: boolean;
}

async function mockMediaApi(page: Page, options: MediaMockOptions) {
  const state = {
    assetPolls: 0,
    createRequests: [] as Array<Record<string, unknown>>,
    currentUploadGrant: '',
    currentUploadId: '',
    readRequests: 0,
    uploadAttempts: 0,
    uploadAuthorization: '',
  };
  const now = () => Math.floor(Date.now() / 1_000);
  const refreshToken = `refresh-${randomUUID()}`;
  const readGrant = `read-${randomUUID()}${randomUUID()}`;

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path === '/api/v1/auth/email/login' && request.method() === 'POST') {
      await json(route, 200, {
        token: jwt({ id: accountId, sessionId, role: 'User', exp: now() + 3_600 }),
        refreshToken,
        tokenExpires: (now() + 3_600) * 1_000,
        user: {
          id: accountId,
          email: 'author@example.test',
          firstName: 'Мария',
          lastName: 'Димова',
          role: 'User',
          mfaEnabled: false,
        },
      });
      return;
    }

    if (path === '/api/v1/auth/me' && request.method() === 'GET') {
      await json(route, 200, {
        id: accountId,
        email: 'author@example.test',
        firstName: 'Мария',
        lastName: 'Димова',
        role: 'User',
        mfaEnabled: false,
      });
      return;
    }

    if (path === '/api/v1/media/uploads' && request.method() === 'POST') {
      state.assetPolls = 0;
      state.currentUploadId = `019a9451-2b60-7000-8000-${String(
        state.createRequests.length + 201,
      ).padStart(12, '0')}`;
      state.currentUploadGrant = `upload-${randomUUID()}${randomUUID()}`;
      state.createRequests.push(request.postDataJSON() as Record<string, unknown>);
      await json(route, 201, {
        uploadId: state.currentUploadId,
        uploadUrl: `/media/v1/uploads/${state.currentUploadId}`,
        grant: state.currentUploadGrant,
        expiresAtUtc: new Date(Date.now() + 60_000).toISOString(),
        maxBytes: Number(state.createRequests.at(-1)?.['length']),
        attemptVersion: 1,
      });
      return;
    }

    if (path === `/api/v1/media/assets/${state.currentUploadId}` && request.method() === 'GET') {
      state.assetPolls += 1;
      const ready = state.assetPolls > 1;
      await json(route, 200, {
        id: state.currentUploadId,
        processingStatus: ready ? 'Ready' : 'Pending',
        contentType: options.contentType,
        variants: ready ? ['original', 'preview'] : [],
        alternativeText: state.createRequests.at(-1)?.['alternativeText'],
        rightsEvidence: state.createRequests.at(-1)?.['rightsEvidence'],
      });
      return;
    }

    if (
      path === `/api/v1/media/assets/${state.currentUploadId}/read-grants` &&
      request.method() === 'POST'
    ) {
      if (options.restrictPreview) {
        await json(route, 403, {
          code: 'media_access_revoked',
          message: 'Editorial review is required.',
        });
        return;
      }
      await json(route, 201, {
        assetId: state.currentUploadId,
        variant: 'preview',
        grant: readGrant,
        url: `/media/v1/assets/${state.currentUploadId}/preview`,
        expiresAtUtc: new Date(Date.now() + 60_000).toISOString(),
      });
      return;
    }

    await json(route, 404, { code: 'not_found', path });
  });

  await page.route('**/media/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path.startsWith('/media/v1/uploads/') && request.method() === 'PUT') {
      state.uploadAttempts += 1;
      state.uploadAuthorization = request.headers()['authorization'] ?? '';
      if (options.failFirstUpload && state.uploadAttempts === 1) {
        await json(route, 503, { code: 'storage_unavailable' });
        return;
      }
      await route.fulfill({ status: 204 });
      return;
    }

    if (path.endsWith('/preview') && request.method() === 'GET') {
      state.readRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: options.contentType,
        body: options.contentType === 'image/png' ? png : pdf,
      });
      return;
    }

    await json(route, 404, { code: 'not_found', path });
  });

  return state;
}

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Имейл').fill('author@example.test');
  await page.getByLabel('Парола').fill(`media-${Date.now()}-${process.pid}`);
  await page.getByRole('button', { name: 'Влез' }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function fillUpload(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<void> {
  await page.goto('/media/upload');
  await page.getByLabel('Снимка или PDF', { exact: true }).setInputFiles(file);
  await page
    .getByLabel('Алтернативен текст или описание')
    .fill('Архивен кадър от заводския двор през 1974 г.');
  await page
    .getByLabel('Доказателство за права и произход')
    .fill('Дарение от семейния архив; разрешението се пази в редакцията.');
}

test('uploads an image, persists rights metadata and opens an authorized preview', async ({
  page,
}) => {
  const api = await mockMediaApi(page, { contentType: 'image/png' });
  await login(page);
  await fillUpload(page, { name: 'factory.png', mimeType: 'image/png', buffer: png });

  await page.getByRole('button', { name: 'Качи и провери' }).click();
  await expect(page.getByText('Проверка и безопасен преглед')).toBeVisible();
  await expect(page.getByText('Файлът е качен, проверен и готов за защитен преглед.')).toBeVisible({
    timeout: 8_000,
  });
  await expect(
    page.getByRole('img', { name: 'Архивен кадър от заводския двор през 1974 г.' }),
  ).toBeVisible();

  expect(api.uploadAuthorization).toBe(`Bearer ${api.currentUploadGrant}`);
  expect(api.createRequests[0]).toMatchObject({
    purpose: 'material-original',
    alternativeText: 'Архивен кадър от заводския двор през 1974 г.',
  });
  expect(api.createRequests[0]?.['rightsEvidence']).toContain('Личен или семеен архив:');
});

test('renders a PDF preview without horizontal overflow on a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const api = await mockMediaApi(page, { contentType: 'application/pdf' });
  await login(page);
  await fillUpload(page, { name: 'letters.pdf', mimeType: 'application/pdf', buffer: pdf });

  const fileInput = page.getByLabel('Снимка или PDF', { exact: true });
  await fileInput.focus();
  await expect(fileInput).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Алтернативен текст или описание')).toBeFocused();

  await page.getByRole('button', { name: 'Качи и провери' }).click();
  await expect(page.getByRole('link', { name: 'Отвори PDF документа' })).toBeVisible({
    timeout: 8_000,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(api.createRequests[0]).toMatchObject({ purpose: 'source-document' });
});

test('keeps the selected file and offers a working retry after an upload failure', async ({
  page,
}) => {
  const api = await mockMediaApi(page, { contentType: 'image/png', failFirstUpload: true });
  await login(page);
  await fillUpload(page, { name: 'retry.png', mimeType: 'image/png', buffer: png });

  await page.getByRole('button', { name: 'Качи и провери' }).click();
  await expect(page.getByRole('alert')).toContainText('хранилище е временно недостъпно');
  await expect(page.getByText('retry.png')).toBeVisible();

  await page.getByRole('button', { name: 'Опитай отново' }).click();
  await expect(page.getByText('Файлът е качен, проверен и готов за защитен преглед.')).toBeVisible({
    timeout: 8_000,
  });
  expect(api.uploadAttempts).toBe(2);
  expect(api.createRequests).toHaveLength(2);
});

test('shows a rights-restricted state and never renders the protected bytes', async ({ page }) => {
  const api = await mockMediaApi(page, { contentType: 'image/png', restrictPreview: true });
  await login(page);
  await fillUpload(page, { name: 'restricted.png', mimeType: 'image/png', buffer: png });

  await page.getByRole('button', { name: 'Качи и провери' }).click();
  await expect(page.getByRole('alert')).toContainText('Правата за този файл са ограничени', {
    timeout: 8_000,
  });
  await expect(page.locator('.preview-card img')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Избери друг файл' })).toBeVisible();
  expect(api.readRequests).toBe(0);
});

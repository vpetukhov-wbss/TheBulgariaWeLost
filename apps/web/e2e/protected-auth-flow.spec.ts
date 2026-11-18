import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

type CurrentRole = 'User' | 'Editor' | 'Administrator';

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

async function mockAuthApi(
  page: Page,
  options: { currentRole: CurrentRole; loginStatus?: number },
) {
  const state = {
    mfaVerified: false,
    refreshCalls: 0,
    refreshAuthorization: '',
  };
  const now = () => Math.floor(Date.now() / 1000);
  const account = () => ({
    id: '019a9451-2b60-7000-8000-000000000001',
    email: 'admin@example.test',
    firstName: options.currentRole === 'User' ? 'Иван' : 'Админ',
    lastName: options.currentRole === 'User' ? 'Потребител' : 'Архив',
    role: options.currentRole,
    mfaEnabled: options.currentRole === 'Administrator',
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path === '/api/v1/auth/email/login' && request.method() === 'POST') {
      if (options.loginStatus) {
        await json(route, options.loginStatus, { code: 'service_unavailable' });
        return;
      }
      await json(route, 200, {
        token: jwt({
          id: account().id,
          sessionId: '019a9451-2b60-7000-8000-000000000002',
          // The old claim is deliberately Administrator. The API remains authoritative.
          role: 'Administrator',
          exp: now() + 2,
        }),
        refreshToken: 'refresh-1',
        tokenExpires: (now() + 2) * 1000,
        user: account(),
      });
      return;
    }

    if (path === '/api/v1/auth/refresh' && request.method() === 'POST') {
      state.refreshCalls += 1;
      state.refreshAuthorization = request.headers()['authorization'] ?? '';
      await json(route, 200, {
        token: jwt({
          id: account().id,
          sessionId: '019a9451-2b60-7000-8000-000000000002',
          role: 'Administrator',
          exp: now() + 60,
        }),
        refreshToken: 'refresh-2',
        tokenExpires: (now() + 60) * 1000,
      });
      return;
    }

    if (path === '/api/v1/auth/me' && request.method() === 'GET') {
      await json(route, 200, account());
      return;
    }

    if (path === '/api/v1/auth/mfa/verify' && request.method() === 'POST') {
      state.mfaVerified = true;
      await route.fulfill({ status: 204 });
      return;
    }

    if (path === '/api/admin/v1/me' && request.method() === 'GET') {
      if (options.currentRole === 'User') {
        await json(route, 403, {
          code: 'forbidden',
          message: 'Back-office access is not allowed.',
        });
        return;
      }
      if (options.currentRole === 'Administrator' && !state.mfaVerified) {
        await json(route, 403, { code: 'mfa_required', message: 'Recent MFA is required.' });
        return;
      }
      await json(route, 200, {
        id: account().id,
        displayName: `${account().firstName} ${account().lastName}`,
        role: options.currentRole,
        permissions: ['BackOffice.Access', 'Editorial.Manage'],
        ...(state.mfaVerified ? { mfaVerifiedAtUtc: new Date().toISOString() } : {}),
      });
      return;
    }

    await json(route, 404, { code: 'not_found', path });
  });

  return state;
}

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Имейл').fill('admin@example.test');
  await page.getByLabel('Парола').fill(`e2e-${Date.now()}-${process.pid}`);
  await page.getByRole('button', { name: 'Влез' }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole('heading', { name: 'Моят профил' })).toBeVisible();
}

test('rotates the refresh token and returns an administrator to the direct route after MFA', async ({
  page,
}) => {
  const api = await mockAuthApi(page, { currentRole: 'Administrator' });
  await login(page);

  await page.waitForTimeout(2_200);
  await page.goto('/admin');

  await expect(page).toHaveURL(/\/mfa\?returnTo=%2Fadmin$/);
  await expect(page.getByRole('heading', { name: 'Многофакторно удостоверяване' })).toBeVisible();
  await page.getByLabel('Шестцифрен код').fill('123456');
  await page.getByRole('button', { name: 'Продължи' }).click();

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Работен панел' })).toBeVisible();
  expect(api.refreshCalls).toBe(1);
  expect(api.refreshAuthorization).toBe('Bearer refresh-1');
  const storedToken = await page.evaluate(() =>
    sessionStorage.getItem('the_bulgaria_we_lost_auth'),
  );
  expect(storedToken).toContain('refresh-2');
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test('rejects a stale Administrator claim when the current API role is User', async ({ page }) => {
  await mockAuthApi(page, { currentRole: 'User' });
  await login(page);

  await page.goto('/admin');
  await expect(page).toHaveURL(/\/forbidden$/);
  await expect(page.getByRole('heading', { name: 'Ограничен достъп' })).toBeVisible();
});

test('shows the explicit unavailable state on the login screen', async ({ page }) => {
  await mockAuthApi(page, { currentRole: 'User', loginStatus: 503 });
  await page.goto('/login');
  await page.getByLabel('Имейл').fill('admin@example.test');
  await page.getByLabel('Парола').fill(`e2e-${Date.now()}-${process.pid}`);
  await page.getByRole('button', { name: 'Влез' }).click();
  await expect(page.getByRole('alert')).toContainText('Услугата е временно недостъпна');
});

import { expect, test } from '@playwright/test';

const editor = {
  id: '019a9451-2b60-7000-8000-000000000711',
  displayName: 'Ралица Иванова',
  role: 'Editor',
  status: 'Active',
};
const accountId = '019a9451-2b60-7000-8000-000000000712';
const address = 'editor@example.test';

test('keeps the account search email out of the browser address', async ({ page }) => {
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    const role = 'Administrator';
    const user = {
      id: accountId,
      role,
      email: 'admin@example.test',
      firstName: 'Мария',
      lastName: 'Иванова',
      mfaEnabled: true,
    };
    if (url.pathname === '/api/v1/auth/email/login') {
      const exp = Math.floor(Date.now() / 1000) + 3_600;
      const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
      const token = [
        encode({ alg: 'HS256', typ: 'JWT' }),
        encode({ id: accountId, role, exp }),
        'test-signature',
      ].join('.');
      return route.fulfill({
        json: { token, refreshToken: 'test-refresh', tokenExpires: exp * 1000, user },
      });
    }
    if (url.pathname === '/api/v1/auth/me') return route.fulfill({ json: user });
    if (url.pathname === '/api/admin/v1/me') {
      return route.fulfill({
        json: {
          id: accountId,
          role,
          displayName: 'Мария Иванова',
          permissions: ['BackOffice.Access', 'Users.Manage'],
          mfaVerifiedAtUtc: new Date().toISOString(),
        },
      });
    }
    if (url.pathname === '/api/admin/v1/users') {
      const q = url.searchParams.get('q');
      const show = q === address && url.searchParams.get('role') === 'Editor';
      return route.fulfill({ json: { items: show ? [editor] : [] } });
    }
    if (url.pathname === '/api/admin/v1/users/' + editor.id) {
      return route.fulfill({
        json: { ...editor, verifiedContactMasked: 'e***@e***', mfaEnabled: false },
      });
    }
    return route.fulfill({ status: 404 });
  });
  await page.goto('/login');
  await page.getByLabel('Имейл').fill('admin@example.test');
  await page.getByLabel('Парола').fill('directory-test-' + Date.now());
  await page.getByRole('button', { name: 'Влез' }).click();
  await expect(page).toHaveURL(/\/account$/);

  await page.goto('/admin');
  await page.getByRole('link', { name: 'Потребители' }).click();
  await page.getByLabel('Роля').selectOption('Editor');
  await page.getByLabel('Имейл').fill(address);
  await page.getByRole('button', { name: 'Търси' }).click();
  await page.getByRole('link', { name: editor.displayName }).click();
  await expect(page.getByText('e***@e***', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/role=Editor$/);
  expect(page.url()).not.toContain('editor%40example');
  await page.getByRole('link', { name: 'Потребители' }).click();
  await expect(page.getByLabel('Роля')).toHaveValue('Editor');
});

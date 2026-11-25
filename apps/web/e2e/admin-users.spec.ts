import { expect, test } from '@playwright/test';
import type { AccountSanction } from '../src/app/api/generated/models/account-sanction';
import type { AdminUserDetail } from '../src/app/api/generated/models/admin-user-detail';

const editor = {
  id: '019a9451-2b60-7000-8000-000000000711',
  displayName: 'Ралица Иванова',
  role: 'Editor',
  status: 'Active',
};
const accountId = '019a9451-2b60-7000-8000-000000000712';
const address = 'editor@example.test';

test('manages a profile while keeping email searches out of the browser address', async ({
  page,
}) => {
  const profile: AdminUserDetail = {
    ...editor,
    role: 'Editor',
    status: 'Active',
    version: 1,
    verifiedContactMasked: 'e***@e***',
    mfaEnabled: false,
  };
  const root = '/api/admin/v1/users/' + editor.id;
  const history: AccountSanction[] = [];
  const sanctionId = '019a9451-2b60-7000-8000-000000000713';
  const operationId = '019a9451-2b60-7000-8000-000000000714';
  const operationUrl = '/api/admin/v1/operations/' + operationId;
  const etag = () => '"account-v' + profile.version + '"';
  const reason = 'Потвърдена проверка на профила.';

  await page.route('**/api/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
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
    if (url.pathname === root) {
      if (request.method() === 'PATCH') {
        expect(request.headers()['if-match']).toBe(etag());
        expect(request.postDataJSON()).toEqual({
          displayName: 'Ралица Петрова',
          bio: 'Поддържа архива.',
        });
        profile.displayName = 'Ралица Петрова';
        profile.bio = 'Поддържа архива.';
        profile.version++;
      }
      return route.fulfill({ json: profile, headers: { etag: etag() } });
    }
    if (url.pathname === root + '/sanctions' && request.method() === 'GET') {
      return route.fulfill({ json: { items: history } });
    }
    if (url.pathname === operationUrl) {
      return route.fulfill({
        json: { id: operationId, targetId: profile.id, status: 'Succeeded' },
      });
    }
    if (url.pathname.startsWith(root + '/') && request.method() === 'POST') {
      expect(request.headers()['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/i);
      expect(request.postDataJSON()).toMatchObject({ expectedVersion: profile.version, reason });
      profile.version++;
      if (url.pathname === root + '/role-changes') {
        expect(request.postDataJSON()).toMatchObject({ role: 'User' });
        profile.role = 'User';
        return route.fulfill({ json: profile, headers: { etag: etag() } });
      }
      if (url.pathname === root + '/sanctions') {
        expect(request.postDataJSON()).toMatchObject({ expiresAtUtc: null });
        const sanction: AccountSanction = {
          id: sanctionId,
          userId: profile.id,
          issuedByUserId: accountId,
          reason,
          startsAtUtc: new Date().toISOString(),
          expiresAtUtc: null,
        };
        profile.status = 'Banned';
        profile.activeSanction = sanction;
        history.push(sanction);
        return route.fulfill({ status: 201, json: sanction });
      }
      if (url.pathname === root + '/sanctions/' + sanctionId + '/revoke') {
        history[0].revokedAtUtc = new Date().toISOString();
        history[0].revokeReason = reason;
        profile.status = 'Active';
        delete profile.activeSanction;
        return route.fulfill({ json: profile, headers: { etag: etag() } });
      }
      if (url.pathname === root + '/session-revocations') return route.fulfill({ status: 204 });
      if (url.pathname === root + '/password-reset-requests') {
        return route.fulfill({ status: 202, json: { operationId, statusUrl: operationUrl } });
      }
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

  await page.getByRole('button', { name: 'Редактирай профила' }).click();
  await page.getByLabel('Име за показване').fill('Ралица Петрова');
  await page.getByLabel('Биография').fill('Поддържа архива.');
  await page.getByRole('button', { name: 'Запази профила' }).click();
  await expect(page.getByRole('heading', { name: 'Ралица Петрова' })).toBeVisible();

  const confirm = page.getByRole('button', { name: 'Потвърди действието' });
  const fillReason = () => page.getByLabel('Причина', { exact: true }).fill(reason);
  await page.getByRole('button', { name: 'Смени ролята' }).click();
  await page.getByLabel('Нова роля').selectOption('User');
  await fillReason();
  await confirm.click();
  await expect(page.getByText('Ролята е сменена и предишните сесии са прекратени.')).toBeVisible();

  await page.getByRole('button', { name: 'Блокирай профила' }).click();
  await page.getByLabel('Без срок').check();
  await expect(confirm).toBeDisabled();
  await fillReason();
  await confirm.click();
  await expect(page.getByText('Блокиран', { exact: true })).toBeVisible();
  await expect(page.getByText(reason, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Изпрати линк за нова парола' })).toBeDisabled();

  await page.getByRole('button', { name: 'Отмени санкцията' }).click();
  await fillReason();
  await confirm.click();
  await expect(page.getByText('Отменена', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Прекрати сесиите' }).click();
  await fillReason();
  await confirm.click();
  await expect(page.getByText('Сесиите са прекратени.', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Изпрати линк за нова парола' }).click();
  await fillReason();
  await confirm.click();
  await expect(page.getByText('Линкът е изпратен.', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Потребители' }).click();
  await expect(page.getByLabel('Роля')).toHaveValue('Editor');
});

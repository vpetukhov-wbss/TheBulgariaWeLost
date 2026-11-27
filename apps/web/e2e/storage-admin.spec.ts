import { expect, test, type Page } from '@playwright/test';
import type { StorageLocationDetail } from '../src/app/api/generated/models/storage-location-detail';
import type { StorageHealth } from '../src/app/api/generated/models/storage-health';
import type { TransitionStorageLocationRequest } from '../src/app/api/generated/models/transition-storage-location-request';

const root = '/api/admin/v1/storage-locations';
const activeId = '019a9451-2b60-7000-8000-000000000972';
const secondId = '019a9451-2b60-7000-8000-000000000973';

async function storageFixture(page: Page, role: 'Administrator' | 'Editor') {
  const isAdmin = role === 'Administrator';
  const user = {
    id: '019a9451-2b60-7000-8000-000000000971',
    role,
    email: 'operator@example.test',
    firstName: 'Мария',
    lastName: 'Иванова',
    mfaEnabled: isAdmin,
  };
  const issuedAt = new Date().toISOString();
  let active: StorageLocationDetail = {
    id: activeId,
    label: 'Главен архив',
    profileId: 'archive',
    provider: 'Sftp',
    status: 'ActiveForNewWrites',
    version: 1,
    updatedAtUtc: issuedAt,
    connectionStatus: 'NotChecked',
    routingVersion: 1,
    transitions: [],
  };
  let draft: StorageLocationDetail | undefined;
  let reads = 0;
  let probes = 0;
  const transitionRequests: TransitionStorageLocationRequest[] = [];

  await page.route('**/api/**', (route) => {
    const request = route.request();
    const { pathname, searchParams } = new URL(request.url());
    if (pathname === '/api/v1/auth/email/login') {
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
    if (pathname === '/api/v1/auth/me') return route.fulfill({ json: user });
    if (pathname === '/api/admin/v1/me') {
      return route.fulfill({
        json: {
          id: user.id,
          role,
          displayName: 'Мария Иванова',
          permissions: ['BackOffice.Access', ...(isAdmin ? ['Storage.Manage'] : [])],
          ...(isAdmin ? { mfaVerifiedAtUtc: issuedAt } : {}),
        },
      });
    }
    if (pathname === '/api/admin/v1/storage-connection-profiles') {
      return route.fulfill({ json: { items: [{ id: 'secondary', label: 'Втори профил' }] } });
    }
    if (pathname.startsWith(root)) {
      reads++;
      const method = request.method();
      const etag = (location: StorageLocationDetail) => '"storage-' + location.version + '"';
      if (pathname === root) {
        if (method === 'GET') {
          const items = draft ? [active, draft] : [active];
          const status = searchParams.get('status');
          return route.fulfill({
            json: { items: items.filter((item) => !status || item.status === status) },
          });
        }
        expect(request.headers()['idempotency-key']).toBeTruthy();
        expect(request.postDataJSON()).toEqual({ label: 'Резерв', profileId: 'secondary' });
        draft = {
          ...active,
          id: secondId,
          label: 'Резерв',
          profileId: 'secondary',
          status: 'Draft',
          transitions: ['ArchiveDraft'],
        };
        return route.fulfill({ status: 201, json: draft, headers: { etag: etag(draft) } });
      }
      if (draft && pathname.startsWith(root + '/' + secondId)) {
        const health: StorageHealth = {
          locationId: secondId,
          status: draft.connectionStatus,
          checkedAtUtc: draft.connectionStatus === 'NotChecked' ? null : issuedAt,
          usedBytes: 0,
          capacityBytes: null,
          lastSuccessfulBackupAtUtc: null,
          lastVerifiedRestoreAtUtc: null,
        };
        if (pathname.endsWith('/asset-issues')) return route.fulfill({ json: { items: [] } });
        if (pathname.endsWith('/health')) return route.fulfill({ json: health });
        if (pathname.endsWith('/connection-checks')) {
          expect(request.postDataJSON()).toEqual({ expectedVersion: draft.version });
          expect(request.headers()['idempotency-key']).toBeTruthy();
          probes++;
          const status = probes === 1 ? 'Denied' : 'Healthy';
          draft = {
            ...draft,
            connectionStatus: status,
            version: draft.version + 1,
            transitions: probes === 1 ? ['ArchiveDraft'] : ['ActivateForNewWrites', 'ArchiveDraft'],
          };
          return route.fulfill({ json: { ...health, status, checkedAtUtc: issuedAt } });
        }
        if (pathname.endsWith('/transitions')) {
          expect(request.headers()['idempotency-key']).toBeTruthy();
          transitionRequests.push(request.postDataJSON() as TransitionStorageLocationRequest);
          active = { ...active, status: 'ReadOnly', routingVersion: 2 };
          draft = {
            ...draft,
            status: 'ActiveForNewWrites',
            version: draft.version + 1,
            routingVersion: 2,
            transitions: [],
          };
        }
        return route.fulfill({ json: draft, headers: { etag: etag(draft) } });
      }
    }
    return route.fulfill({ status: 404, json: { code: 'not_found' } });
  });

  await page.goto('/login?returnTo=%2Fadmin%2Fstorage');
  await page.getByLabel('Имейл').fill(user.email);
  await page.getByLabel('Парола', { exact: true }).fill(crypto.randomUUID());
  await page.getByRole('button', { name: 'Влез', exact: true }).click();
  return { transitionRequests, reads: () => reads };
}

test('admin creates a draft, checks access and confirms a new upload target', async ({ page }) => {
  const fixture = await storageFixture(page, 'Administrator');
  await expect(page.getByRole('heading', { name: 'Файлови хранилища' })).toBeVisible();
  await page.getByRole('button', { name: 'Добави хранилище' }).click();
  await page.getByLabel('Име на хранилището').fill('Резерв');
  await page.getByRole('combobox', { name: 'SFTP профил', exact: true }).selectOption('secondary');
  await page.getByRole('button', { name: 'Запази', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Резерв', exact: true })).toBeVisible();

  const probe = page.getByRole('button', { name: 'Тествай връзката' });
  await probe.click();
  await expect(page.getByText('Отказан достъп', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Използвай за нови качвания' })).toHaveCount(0);
  await probe.click();
  await expect(page.getByText('Успешна връзка', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Използвай за нови качвания' }).click();
  await expect(page.getByText('Текуща цел за нови качвания')).toContainText('Главен архив');
  await page.getByLabel('Причина', { exact: true }).fill('Планирана смяна');
  await page.getByRole('button', { name: 'Потвърди', exact: true }).click();
  await expect(page.getByText('Новите качвания вече използват това хранилище.')).toBeVisible();
  expect(fixture.transitionRequests).toEqual([
    {
      action: 'ActivateForNewWrites',
      expectedVersion: 3,
      expectedRoutingVersion: 1,
      reason: 'Планирана смяна',
    },
  ]);
});

test('editor has no direct access to storage management', async ({ page }) => {
  const fixture = await storageFixture(page, 'Editor');
  await expect(page).toHaveURL(/\/forbidden$/);
  await page.goto('/admin/storage/' + secondId);
  await expect(page).toHaveURL(/\/forbidden$/);
  expect(fixture.reads()).toBe(0);
});

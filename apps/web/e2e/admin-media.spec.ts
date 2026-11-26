import { expect, test, type Page } from '@playwright/test';
import type { AdminMediaDetail } from '../src/app/api/generated/models/admin-media-detail';

const id = '019a9451-2b60-7000-8000-000000001201';
const materialId = '019a9451-2b60-7000-8000-000000001202';
const accountId = '019a9451-2b60-7000-8000-000000001203';
const base = '/api/admin/v1/media-assets';

async function signIn(page: Page, role: 'Administrator' | 'Editor') {
  const administrator = role === 'Administrator';
  const asset: AdminMediaDetail = {
    id,
    accessibilityText: 'Архивна снимка на града',
    version: 1,
    accessStatus: 'Active',
    processingStatus: 'Ready',
    canEdit: administrator,
    length: 68,
    previewAvailable: true,
    publicationEligible: true,
    purpose: 'material-original',
    rightsStatus: 'Recorded',
    rightsEvidence: 'Писмено разрешение.',
    type: 'Image',
    updatedAtUtc: new Date().toISOString(),
    ...(administrator ? { restrictionAction: 'Restrict' } : {}),
  };
  const etag = () => '"media-' + asset.version + '"';
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const user = {
      id: accountId,
      role,
      email: 'operator@example.test',
      firstName: 'Мария',
      lastName: 'Иванова',
      mfaEnabled: administrator,
    };
    if (path === '/api/v1/auth/email/login') {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
      const token = [
        encode({ alg: 'HS256', typ: 'JWT' }),
        encode({ id: accountId, role, exp }),
        'test-signature',
      ].join('.');
      return route.fulfill({
        json: { token, refreshToken: 'media-fixture', tokenExpires: exp * 1000, user },
      });
    }
    if (path === '/api/v1/auth/me') return route.fulfill({ json: user });
    if (path === '/api/admin/v1/me')
      return route.fulfill({
        json: {
          id: accountId,
          role,
          displayName: 'Мария Иванова',
          permissions: ['BackOffice.Access', 'Editorial.Manage'],
          ...(administrator ? { mfaVerifiedAtUtc: new Date().toISOString() } : {}),
        },
      });
    if (path === base) {
      const type = url.searchParams.get('type');
      return route.fulfill({ json: { items: type === 'Pdf' ? [] : [asset] } });
    }
    if (path === base + '/' + id) {
      if (request.method() === 'PATCH') {
        expect(request.headers()['if-match']).toBe(etag());
        expect(request.postDataJSON()).toMatchObject({
          creditLine: 'Музей на града',
          reason: 'Уточнен е кредитът.',
        });
        asset.creditLine = 'Музей на града';
        asset.version++;
      }
      return route.fulfill({ json: asset, headers: { etag: etag() } });
    }
    if (path === base + '/' + id + '/usages') {
      return route.fulfill({
        json: { total: 1, items: [{ materialId, title: 'Градски архив', revisionNumber: 2 }] },
      });
    }
    if (path === base + '/' + id + '/preview-grants') {
      return route.fulfill({
        status: 201,
        json: {
          assetId: id,
          variant: 'preview',
          grant: 'preview-fixture',
          url: '/media/v1/assets/' + id + '/preview',
          expiresAtUtc: new Date().toISOString(),
        },
      });
    }
    if (path === base + '/' + id + '/access-restrictions') {
      expect(request.headers()['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/i);
      expect(request.postDataJSON()).toMatchObject({
        action: asset.restrictionAction,
        expectedVersion: asset.version,
        reason: 'Проверка на правата.',
      });
      asset.accessStatus = asset.restrictionAction === 'Restrict' ? 'Restricted' : 'Active';
      asset.restrictionAction =
        asset.restrictionAction === 'Restrict' ? 'LiftRestriction' : 'Restrict';
      asset.previewAvailable = asset.accessStatus === 'Active';
      asset.version++;
      return route.fulfill({ json: asset, headers: { etag: etag() } });
    }
    return route.fulfill({ status: 404 });
  });
  await page.route('**/media/v1/assets/*/preview', (route) => {
    expect(route.request().headers()['authorization']).toBe('Bearer preview-fixture');
    return route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMBAAZrX1cAAAAASUVORK5CYII=',
        'base64',
      ),
    });
  });
  await page.goto('/login');
  await page.getByLabel('Имейл').fill('operator@example.test');
  await page.getByLabel('Парола').fill('gallery-fixture-' + Date.now());
  await page.getByRole('button', { name: 'Влез' }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test('filters the gallery and manages metadata, usages and protected previews', async ({
  page,
}) => {
  await signIn(page, 'Administrator');
  await page.goto('/admin/media');
  await page.getByRole('combobox', { name: 'Тип', exact: true }).selectOption('Pdf');
  await page.getByRole('button', { name: 'Филтрирай' }).click();
  await expect(page.getByText('Няма файлове за избраните филтри.')).toBeVisible();
  await page.getByRole('combobox', { name: 'Тип', exact: true }).selectOption('Image');
  await page.getByRole('button', { name: 'Филтрирай' }).click();
  await page.getByRole('link', { name: 'Архивна снимка на града' }).click();
  await expect(page.getByRole('link', { name: 'Градски архив' })).toBeVisible();
  await page.getByRole('button', { name: 'Зареди прегледа' }).click();
  await expect(page.getByRole('img', { name: 'Архивна снимка на града' })).toBeVisible();

  await page.getByRole('button', { name: 'Редактирай метаданните' }).click();
  await page.getByLabel('Кредит', { exact: true }).fill('Музей на града');
  await page.getByLabel('Причина за промяната').fill('Уточнен е кредитът.');
  await page.getByRole('button', { name: 'Запази метаданните' }).click();
  await expect(page.getByText('Метаданните са записани.')).toBeVisible();
  await page.getByRole('button', { name: 'Ограничи достъпа' }).click();
  await page.getByLabel('Причина за промяната').fill('Проверка на правата.');
  await page.getByRole('button', { name: 'Потвърди' }).click();
  await expect(page.getByText('Достъпът е ограничен.')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Архивна снимка на града' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Отмени ограничението' }).click();
  await page.getByLabel('Причина за промяната').fill('Проверка на правата.');
  await page.getByRole('button', { name: 'Потвърди' }).click();
  await expect(page.getByText('Ограничението е отменено.')).toBeVisible();
  await page.getByRole('link', { name: 'Медии', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Тип', exact: true })).toHaveValue('Image');
});

test('shows read-only media controls for a reviewer of another author’s file', async ({ page }) => {
  await signIn(page, 'Editor');
  await page.goto('/admin/media/' + id);
  await expect(page.getByRole('heading', { name: 'Архивна снимка на града' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Редактирай метаданните' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ограничи достъпа' })).toHaveCount(0);
});

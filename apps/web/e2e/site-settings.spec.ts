import { expect, test, type Page } from '@playwright/test';
import type { PublicSiteSettings } from '../src/app/api/generated/models/public-site-settings';
import type { SiteSettings } from '../src/app/api/generated/models/site-settings';
import type { UpdateSiteSettingsRequest } from '../src/app/api/generated/models/update-site-settings-request';

const adminPath = '/api/admin/v1/site-settings';
const publicPath = '/api/v1/site-settings';
const material = {
  id: '019a9451-2b60-7000-8000-000000000911',
  title: 'Архивна изложба',
  slug: 'archive-exhibition',
};
const start: SiteSettings = {
  siteName: 'България, която изгубихме',
  version: 1,
  footerLinks: [],
  socialLinks: [],
  banners: [],
  featuredMaterialIds: [],
};

async function signIn(page: Page, role: 'Administrator' | 'Editor', startWithConflict: boolean) {
  const accountId = '019a9451-2b60-7000-8000-000000000912';
  let current = { ...start };
  let conflict = startWithConflict;
  const attempts: UpdateSiteSettingsRequest[] = [];
  let protectedReads = 0;
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const isAdministrator = role === 'Administrator';
    const user = {
      id: accountId,
      role,
      email: 'operator@example.test',
      firstName: 'Мария',
      lastName: 'Иванова',
      mfaEnabled: isAdministrator,
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
        json: { token, refreshToken: 'login-fixture', tokenExpires: exp * 1000, user },
      });
    }
    if (path === '/api/v1/auth/me') return route.fulfill({ json: user });
    if (path === '/api/admin/v1/me') {
      return route.fulfill({
        json: {
          id: accountId,
          role,
          displayName: 'Мария Иванова',
          permissions: ['BackOffice.Access', ...(isAdministrator ? ['SiteSettings.Manage'] : [])],
          ...(isAdministrator ? { mfaVerifiedAtUtc: new Date().toISOString() } : {}),
        },
      });
    }
    if (path === publicPath) {
      expect(request.headers()['authorization']).toBeUndefined();
      const data: PublicSiteSettings = {
        siteName: current.siteName,
        supportContact: current.supportContact,
        footerLinks: current.footerLinks,
        socialLinks: current.socialLinks,
        banners: current.banners.filter(({ enabled }) => enabled),
        featuredMaterials: current.featuredMaterialIds.includes(material.id) ? [material] : [],
      };
      return route.fulfill({ json: data });
    }
    if (path === '/api/admin/v1/materials') return route.fulfill({ json: { items: [material] } });
    if (path === adminPath) {
      const etag = () => '"site-settings-v' + current.version + '"';
      if (request.method() === 'GET') {
        protectedReads++;
        return route.fulfill({ json: current, headers: { etag: etag() } });
      }
      expect(request.headers()['if-match']).toBe(etag());
      const { reason, ...input } = request.postDataJSON() as UpdateSiteSettingsRequest;
      attempts.push({ ...input, reason });
      if (conflict) {
        conflict = false;
        current = {
          ...current,
          siteName: 'Име, записано от друг администратор',
          version: current.version + 1,
        };
        return route.fulfill({ status: 412, json: { code: 'version_conflict' } });
      }
      current = { ...input, version: current.version + 1 };
      return route.fulfill({ json: current, headers: { etag: etag() } });
    }
    return route.fulfill({ status: 404 });
  });

  await page.goto('/login');
  await page.getByLabel('Имейл').fill('operator@example.test');
  await page.getByLabel('Парола').fill('settings-ui-' + Date.now());
  await page.getByRole('button', { name: 'Влез' }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.goto('/admin');
  return { attempts, protectedReads: () => protectedReads };
}

test('reviews site settings, retains a conflicting edit and applies public presentation', async ({
  page,
}) => {
  const { attempts } = await signIn(page, 'Administrator', true);
  await page.getByRole('link', { name: 'Настройки на сайта' }).click();
  const siteName = page.getByLabel('Име на сайта', { exact: true });
  await siteName.fill('Моята незаписана промяна');
  const preview = page.getByRole('button', { name: 'Преглед на промените' });
  const save = page.getByRole('button', { name: 'Запази промените' });
  await preview.click();
  await page.getByLabel('Причина за промяната').fill('Обновявам името.');
  await save.click();
  await expect(page.getByText('Има по-нова версия на настройките.')).toBeVisible();
  await expect(save).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Моята незаписана промяна' })).toBeVisible();
  await page.getByRole('button', { name: 'Назад към редакцията' }).click();
  await expect(siteName).toHaveValue('Моята незаписана промяна');
  await page.getByRole('button', { name: 'Зареди актуалната версия и замени черновата' }).click();
  await expect(siteName).toHaveValue('Име, записано от друг администратор');

  await siteName.fill('Архив на общността');
  await page.getByLabel('Публичен имейл за контакт').fill('public@example.test');
  await page.getByRole('button', { name: 'Добави връзка' }).click();
  const footer = page.getByRole('group', { name: 'Връзка 1' });
  await footer.getByLabel('Етикет').fill('Изложбата');
  await footer.getByLabel('Адрес').fill('/materials/archive-exhibition');
  await page.getByRole('button', { name: 'Социални канали' }).click();
  await page.getByLabel('YouTube').fill('https://www.youtube.com/@archive');
  await page.getByRole('button', { name: 'Начална страница' }).click();
  await page.getByRole('button', { name: 'Добави лента' }).click();
  await page.getByLabel('Текст на лентата').fill('Виж новата ни изложба.');
  await page.getByLabel('Публикуван материал (заглавие или ID)').fill(material.id);
  await page.getByRole('button', { name: 'Добави материал' }).click();
  await preview.click();
  await expect(page.getByText('Виж новата ни изложба.')).toBeVisible();
  await expect(page.getByText(material.title, { exact: true })).toBeVisible();
  await page.getByLabel('Причина за промяната').fill('Добавям представяне за изложбата.');
  await save.click();
  await expect(page.getByText('Настройките са записани.')).toBeVisible();
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toMatchObject({
    featuredMaterialIds: [material.id],
    supportContact: 'public@example.test',
  });

  await page.getByRole('link', { name: 'Архив на общността' }).click();
  await expect(page.getByRole('heading', { name: 'Архив на общността' })).toBeVisible();
  await expect(page.getByText('Виж новата ни изложба.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'YouTube' })).toHaveAttribute(
    'href',
    'https://www.youtube.com/@archive',
  );
  await expect(page.getByRole('link', { name: 'Контакт' })).toHaveAttribute(
    'href',
    'mailto:public@example.test',
  );
  await expect(page.getByRole('link', { name: material.title })).toHaveAttribute(
    'href',
    '/materials/archive-exhibition',
  );
});

test('keeps site settings out of the editor navigation and rejects direct access', async ({
  page,
}) => {
  const { protectedReads } = await signIn(page, 'Editor', false);
  await expect(page.getByRole('heading', { name: 'Работен панел' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Настройки на сайта' })).toHaveCount(0);
  await page.goto('/admin/settings');
  await expect(page).toHaveURL(/\/forbidden$/);
  expect(protectedReads()).toBe(0);
});

import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import type { MaterialDetail } from '../src/app/api/generated/models/material-detail';
import type { UpdateMaterialDraftRequest } from '../src/app/api/generated/models/update-material-draft-request';

const account = {
  id: '019a9451-2b60-7000-8000-000000000001',
  email: 'author@example.test',
  firstName: 'Мария',
  lastName: 'Димова',
  role: 'User',
  mfaEnabled: false,
};
const id = '019a9451-2b60-7000-8000-000000000002';
const options = {
  categoryIds: { id: '019a9451-2b60-7000-8000-000000000003', label: 'Индустрия' },
  topicIds: { id: '019a9451-2b60-7000-8000-000000000004', label: 'Фабрики' },
  sourceIds: { id: '019a9451-2b60-7000-8000-000000000005', label: 'Личен архив' },
};
const root = '/api/v1/author/materials';
const saved = '/api/v1/account/saved-materials';

function respond(route: Route, status: number, json: unknown, headers?: Record<string, string>) {
  return route.fulfill({ status, json, headers });
}

async function mockApi(page: Page) {
  const state = {
    created: false,
    saved: false,
    detail: {
      id,
      slug: 'stara-fabrika',
      type: 'Story',
      language: 'bg',
      authorId: account.id,
      status: 'Unpublished',
      workingStatus: 'Draft',
      publicVisibility: false,
      version: 1,
      updatedAtUtc: new Date().toISOString(),
      draft: {
        title: 'Спомен от фабриката',
        blocks: [],
        categoryIds: [],
        topicIds: [],
        sourceIds: [],
        mediaRefs: [],
        rights: { publicDisplayAllowed: false, statement: 'Not reviewed.' },
      },
      allowedActions: ['SubmitForReview'],
      publicationBlockers: ['content_required'],
    } as MaterialDetail,
  };
  const headers = () => ({ etag: `"material-${id}-v${state.detail.version}"` });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const { pathname: path } = new URL(request.url());
    if (path === '/api/v1/auth/email/login') {
      const exp = Math.floor(Date.now() / 1_000) + 3600;
      const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
      return respond(route, 200, {
        token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ id: account.id, role: 'User', exp })}.test-signature`,
        refreshToken: 'ephemeral-test-refresh',
        tokenExpires: exp * 1000,
        user: account,
      });
    }
    if (path === '/api/v1/auth/me') return respond(route, 200, account);
    if (path === root && method === 'GET') {
      return respond(route, 200, {
        items: state.created ? [{ ...state.detail, title: state.detail.draft.title }] : [],
      });
    }
    if (path === root && method === 'POST') {
      state.created = true;
      return respond(route, 201, state.detail, headers());
    }
    if (path === `${root}/${id}` && method === 'GET')
      return respond(route, 200, state.detail, headers());
    if (path === `${root}/${id}` && method === 'PATCH') {
      if (request.headers()['if-match'] !== headers().etag)
        return respond(route, 412, { code: 'version_conflict' });
      const { changeSummary: _changeSummary, ...draft } =
        request.postDataJSON() as UpdateMaterialDraftRequest;
      state.detail.draft = { ...state.detail.draft, ...draft };
      state.detail.version += 1;
      state.detail.publicationBlockers = [];
      return respond(route, 200, state.detail, headers());
    }
    if (path === `${root}/${id}/submissions`) {
      expect(request.postDataJSON()).toEqual({ expectedVersion: state.detail.version });
      state.detail.version += 1;
      state.detail.workingStatus = 'Submitted';
      state.detail.allowedActions = [];
      return respond(route, 200, state.detail, headers());
    }
    if (path.startsWith('/api/v1/author/catalog-options/')) {
      const field = path.split('/').at(-1) as keyof typeof options;
      return respond(route, 200, { items: [options[field]] });
    }
    if (path === '/api/v1/materials/stara-fabrika') {
      return respond(route, 200, {
        ...state.detail,
        content: { ...state.detail.draft, body: 'Историята на квартала.' },
      });
    }
    if (path === saved) {
      return respond(route, 200, {
        items: state.saved
          ? [
              {
                id,
                slug: state.detail.slug,
                title: state.detail.draft.title,
                savedAtUtc: state.detail.updatedAtUtc,
              },
            ]
          : [],
      });
    }
    if (path === `${saved}/${id}`) {
      state.saved = method === 'PUT';
      return route.fulfill({ status: 204 });
    }
    return respond(route, 404, { code: 'not_found' });
  });
  return state;
}

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Имейл').fill(account.email);
  await page.getByLabel('Парола').fill(`author-test-${Date.now()}`);
  await page.getByRole('button', { name: 'Влез' }).click();
  await expect(page).toHaveURL(/\/account$/);
}

test('protects author routes and resumes a saved block draft after reloading', async ({ page }) => {
  await mockApi(page);
  await page.goto('/account/materials');
  await expect(page).toHaveURL(/\/login\?returnTo=%2Faccount%2Fmaterials$/);
  await login(page);
  await page.getByRole('link', { name: 'Моите материали' }).click();
  await expect(page.getByText('Все още нямаш материали', { exact: false })).toBeVisible();
  await page.getByRole('link', { name: 'Нов материал' }).click();
  await page.getByLabel('Заглавие', { exact: true }).fill('Спомен от фабриката');
  await page.getByRole('button', { name: 'Създай чернова' }).click();
  await expect(page).toHaveURL(new RegExp(`/account/materials/${id}$`));
  await page.getByRole('button', { name: 'Добави абзац' }).click();
  const block = page.getByLabel('Текст на блок 1');
  await block.fill('Текстът се пази на сървъра.');
  await page.getByLabel('Избери от Категории').selectOption({ label: 'Индустрия' });
  await page.getByLabel('Избери от Теми').selectOption({ label: 'Фабрики' });
  await page.getByLabel('Избери от Източници').selectOption({ label: 'Личен архив' });
  await page.getByLabel('Имам право на публично показване').check();
  await page.getByLabel('Основание за правата').fill('Личен авторски разказ.');
  await page.getByRole('button', { name: 'Запази чернова' }).click();
  await expect(page.getByText('Черновата е запазена.')).toBeVisible();
  await page.reload();
  await expect(block).toHaveValue('Текстът се пази на сървъра.');
  await page.getByRole('button', { name: 'Изпрати за преглед' }).click();
  await expect(page.getByText('Материалът е изпратен за редакционен преглед.')).toBeVisible();
  await expect(block).not.toBeEditable();
});

test('retains local text during a version conflict and shows the latest correction', async ({
  page,
}) => {
  const state = await mockApi(page);
  await login(page);
  await page.goto(`/account/materials/${id}`);
  const title = page.getByLabel('Заглавие', { exact: true });
  await title.fill('Моята локална редакция');
  state.detail.version += 1;
  state.detail.workingStatus = 'ChangesRequested';
  state.detail.correctionNote = 'Уточни името на фабриката.';
  await page.getByRole('button', { name: 'Запази чернова' }).click();
  await expect(page.getByRole('alert')).toContainText('Твоите промени остават на екрана');
  await expect(title).toHaveValue('Моята локална редакция');
  await page.getByRole('button', { name: 'Зареди актуалната версия' }).click();
  await expect(page.getByText('Уточни името на фабриката.')).toBeVisible();
  await expect(title).toHaveValue('Спомен от фабриката');
});

test('saves from a public page and removes a bookmark on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await login(page);
  await page.goto('/account/saved');
  await expect(page.getByText('Няма запазени материали.', { exact: false })).toBeVisible();
  await page.goto('/materials/stara-fabrika');
  await page.getByRole('button', { name: 'Запази материала' }).click();
  await expect(page.getByText('Добавен в запазените материали.')).toBeVisible();
  await page.getByRole('link', { name: 'Запазени материали' }).click();
  await expect(page.getByRole('link', { name: 'Спомен от фабриката' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Премахни Спомен от фабриката' }).click();
  await expect(page.getByText('Няма запазени материали.', { exact: false })).toBeVisible();
});

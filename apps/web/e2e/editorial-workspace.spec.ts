import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import type { CatalogDetail } from '../src/app/api/generated/models/catalog-detail';
import type { MaterialDetail } from '../src/app/api/generated/models/material-detail';
import type { MaterialDraft } from '../src/app/api/generated/models/material-draft';
import type { TransitionMaterialRequest } from '../src/app/api/generated/models/transition-material-request';

const editorId = '019a9451-2b60-7000-8000-000000000511';
const authorId = '019a9451-2b60-7000-8000-000000000512';
const materialId = '019a9451-2b60-7000-8000-000000000513';
const categoryId = '019a9451-2b60-7000-8000-000000000514';
const topicId = '019a9451-2b60-7000-8000-000000000515';
const sourceId = '019a9451-2b60-7000-8000-000000000516';
const archive = '/api/admin/v1/materials';
const authoring = `/api/v1/author/materials/${materialId}`;
const catalog = '/api/admin/v1/catalog/categories';
const originalTitle = 'Спомен от фабриката';
const fixedTitle = 'Спомен от фабрика Берое';
const correction = 'Уточни името на фабриката.';

function json(route: Route, status: number, value: unknown, etag?: string) {
  return route.fulfill({ status, json: value, ...(etag ? { headers: { etag } } : {}) });
}

function fixture() {
  const updatedAtUtc = new Date().toISOString();
  const draft: MaterialDraft = {
    title: originalTitle,
    body: 'История от личния архив.',
    categoryIds: [categoryId],
    topicIds: [topicId],
    sourceIds: [sourceId],
    mediaRefs: [],
    rights: { publicDisplayAllowed: true, statement: 'Потвърдени от автора права.' },
  };
  const material: MaterialDetail = {
    id: materialId,
    slug: 'spomen-ot-fabrikata',
    authorId,
    type: 'Story',
    language: 'bg',
    draft,
    status: 'Unpublished',
    workingStatus: 'Draft',
    workingRevisionNumber: 1,
    version: 1,
    allowedActions: [],
    publicVisibility: false,
    publicationBlockers: [],
    updatedAtUtc,
  };
  const category: CatalogDetail = {
    id: categoryId,
    kind: 'categories',
    name: 'Индустрия',
    slug: 'industria',
    status: 'Proposed',
    version: 1,
    updatedAtUtc,
    fields: { isVisible: true, description: 'Труд и производство' },
    allowedActions: ['Approve', 'Merge'],
  };
  return {
    material,
    category,
    revisions: new Map<number, MaterialDraft>([[1, draft]]),
    updatedAtUtc,
    transitions: [] as string[],
  };
}

async function mockApi(page: Page, role: 'Editor' | 'User', state: ReturnType<typeof fixture>) {
  const account = {
    id: role === 'Editor' ? editorId : authorId,
    role,
    email: role.toLowerCase() + '@example.test',
    firstName: role === 'Editor' ? 'Ралица' : 'Мария',
    lastName: 'Иванова',
    mfaEnabled: false,
  };
  const { material, category } = state;
  const etag = () => `"material-${materialId}-v${material.version}"`;
  const materialView = () => ({
    ...material,
    allowedActions:
      role === 'User'
        ? material.workingStatus === 'Draft' || material.workingStatus === 'ChangesRequested'
          ? ['SubmitForReview']
          : []
        : material.workingStatus === 'Submitted'
          ? ['StartReview']
          : material.workingStatus === 'InReview'
            ? ['RequestChanges', 'Publish']
            : [],
  });
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    if (path === '/api/v1/auth/email/login') {
      const exp = Math.floor(Date.now() / 1000) + 3_600;
      const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
      const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ id: account.id, role, exp })}.test-signature`;
      return json(route, 200, {
        token,
        refreshToken: `test-refresh-${role}`,
        tokenExpires: exp * 1000,
        user: account,
      });
    }
    if (path === '/api/v1/auth/me') return json(route, 200, account);
    if (path.startsWith('/api/admin/') && role === 'User')
      return json(route, 403, { code: 'forbidden' });
    if (path === '/api/admin/v1/me') {
      return json(route, 200, {
        id: account.id,
        role,
        displayName: 'Ралица Иванова',
        permissions: ['BackOffice.Access', 'Editorial.Manage'],
      });
    }
    if (path === '/api/v1/author/catalog-options/categoryIds')
      return json(route, 200, { items: [{ id: categoryId, label: category.name }] });
    if (path === '/api/v1/author/catalog-options/topicIds')
      return json(route, 200, { items: [{ id: topicId, label: 'Производство' }] });
    if (path === '/api/v1/author/catalog-options/sourceIds')
      return json(route, 200, { items: [{ id: sourceId, label: 'Личен архив' }] });
    if (path === archive) {
      const allowed =
        (!url.searchParams.has('workingStatus') ||
          url.searchParams.get('workingStatus') === material.workingStatus) &&
        (!url.searchParams.has('type') || url.searchParams.get('type') === material.type);
      return json(route, 200, {
        items: allowed ? [{ ...material, title: material.draft.title }] : [],
      });
    }
    if (path === authoring || path === `${archive}/${materialId}`) {
      if (method === 'PATCH') {
        if (req.headers()['if-match'] !== etag())
          return json(route, 412, { code: 'version_conflict' });
        material.draft = { ...material.draft, ...(req.postDataJSON() as Partial<MaterialDraft>) };
        const revision = (material.workingRevisionNumber ?? 0) + 1;
        material.workingRevisionNumber = revision;
        material.version += 1;
        state.revisions.set(revision, material.draft);
      }
      return json(route, 200, materialView(), etag());
    }
    if (path === `${authoring}/submissions`) {
      expect(req.postDataJSON()).toEqual({ expectedVersion: material.version });
      state.transitions.push('SubmitForReview');
      material.workingStatus = 'Submitted';
      delete material.correctionNote;
      material.version += 1;
      return json(route, 200, materialView(), etag());
    }
    if (path === `${archive}/${materialId}/transitions`) {
      const body = req.postDataJSON() as TransitionMaterialRequest;
      expect(body.expectedVersion).toBe(material.version);
      expect(materialView().allowedActions).toContain(body.action);
      state.transitions.push(body.action);
      if (body.action === 'StartReview') material.workingStatus = 'InReview';
      if (body.action === 'RequestChanges') {
        material.workingStatus = 'ChangesRequested';
        material.correctionNote = body.reason;
      }
      if (body.action === 'Publish') {
        material.status = 'Published';
        material.publicVisibility = true;
        material.publishedRevisionNumber = material.workingRevisionNumber;
        delete material.workingStatus;
        delete material.workingRevisionNumber;
      }
      material.version += 1;
      return json(route, 200, materialView(), etag());
    }
    if (path === `${archive}/${materialId}/revisions`) {
      return json(route, 200, {
        items: Array.from(state.revisions.keys())
          .reverse()
          .map((revisionNumber) => ({
            materialId,
            revisionNumber,
            createdAtUtc: state.updatedAtUtc,
            createdByUserId: authorId,
          })),
      });
    }
    if (path.startsWith(`${archive}/${materialId}/revisions/`)) {
      const revisionNumber = Number(path.split('/').at(-1));
      return json(route, 200, {
        materialId,
        revisionNumber,
        createdAtUtc: state.updatedAtUtc,
        createdByUserId: authorId,
        content: state.revisions.get(revisionNumber),
      });
    }
    if (path === catalog) return json(route, 200, { items: [category] });
    if (path === `${catalog}/${categoryId}`)
      return json(route, 200, category, `"catalog-${categoryId}-v${category.version}"`);
    if (path === `${catalog}/${categoryId}/transitions`) {
      expect(req.postDataJSON()).toEqual({ action: 'Approve', expectedVersion: category.version });
      category.status = 'Approved';
      category.allowedActions = ['Hide', 'Merge'];
      category.version += 1;
      return json(route, 200, category, `"catalog-${categoryId}-v${category.version}"`);
    }
    if (path === `/api/v1/materials/${material.slug}` && material.publicVisibility) {
      return json(route, 200, {
        ...material,
        content: material.draft,
        revisionNumber: material.publishedRevisionNumber,
      });
    }
    return json(route, 404, { code: 'not_found' });
  });

  await page.goto('/login');
  await page.getByLabel('Имейл').fill(account.email);
  await page.getByLabel('Парола').fill(`editorial-test-${Date.now()}`);
  await page.getByRole('button', { name: 'Влез' }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function confirmAction(page: Page, name: string, reason?: string) {
  await page.getByRole('button', { name, exact: true }).click();
  if (reason) await page.getByLabel('Причина', { exact: true }).fill(reason);
  await page.getByRole('button', { name: 'Потвърди действието' }).click();
}

test('keeps queue filters across an author correction, compares revisions and publishes', async ({
  page,
  context,
}) => {
  const state = fixture();
  const authorPage = await context.newPage();
  await mockApi(authorPage, 'User', state);
  await authorPage.goto(`/account/materials/${materialId}`);
  await authorPage.getByRole('button', { name: 'Изпрати за преглед' }).click();
  await expect(authorPage.getByText('Материалът е изпратен за редакционен преглед.')).toBeVisible();

  await mockApi(page, 'Editor', state);
  await page.goto('/admin');
  await page.getByRole('link', { name: 'Редакторска опашка' }).click();
  await expect(page.getByRole('heading', { name: 'Редакторска опашка' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Тип', exact: true }).selectOption('Story');
  await expect(page).toHaveURL(/stage=Submitted&type=Story$/);
  await page.getByRole('link', { name: originalTitle }).click();
  await confirmAction(page, 'Започни преглед');
  await confirmAction(page, 'Върни за корекции', correction);
  await expect(page.getByText(correction, { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Редакторска опашка' }).click();
  await expect(page).toHaveURL(/\/admin\/materials\?stage=Submitted&type=Story$/);
  await expect(page.getByText('Няма материали за избраните филтри.')).toBeVisible();

  await authorPage.reload();
  await expect(authorPage.getByText(correction, { exact: false })).toBeVisible();
  await authorPage.getByLabel('Заглавие', { exact: true }).fill(fixedTitle);
  await authorPage.getByRole('button', { name: 'Изпрати за преглед' }).click();
  await expect(authorPage.getByText('Материалът е изпратен за редакционен преглед.')).toBeVisible();
  await page.reload();
  await page.getByRole('link', { name: fixedTitle }).click();
  await page.getByRole('button', { name: 'Ревизии', exact: true }).click();
  await page.getByRole('button', { name: 'Сравни ревизиите' }).click();
  await expect(page.getByRole('heading', { name: 'Ревизия №2 спрямо №3' })).toBeVisible();
  await expect(page.getByText(originalTitle, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Съдържание и права' }).click();
  await confirmAction(page, 'Започни преглед');
  await confirmAction(page, 'Публикувай');
  await page.getByRole('link', { name: 'Виж публикацията' }).click();
  await expect(page.getByRole('heading', { name: fixedTitle })).toBeVisible();
  expect(state.transitions).toEqual([
    'SubmitForReview',
    'StartReview',
    'RequestChanges',
    'SubmitForReview',
    'StartReview',
    'Publish',
  ]);
});

test('lets editors approve a catalog category and hides the administrator-only merge', async ({
  page,
}) => {
  const state = fixture();
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, 'Editor', state);
  await page.goto('/admin/catalog/categories');
  await page.getByRole('link', { name: 'Индустрия' }).click();
  await expect(page.getByRole('heading', { name: 'Индустрия' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Обедини дубликат' })).toHaveCount(0);
  await confirmAction(page, 'Одобри');
  await expect(page.getByText('Одобрен · Версия 2')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('denies access to an editorial detail opened directly by a normal user', async ({ page }) => {
  await mockApi(page, 'User', fixture());
  await page.goto(`/admin/materials/${materialId}`);
  await expect(page).toHaveURL(/\/forbidden$/);
  await expect(page.getByRole('heading', { name: 'Ограничен достъп' })).toBeVisible();
});

test('an editor saves episode fields in a revision and publishes it', async ({ page }) => {
  const state = fixture();
  state.material.type = 'Episode';
  state.material.workingStatus = 'InReview';
  await mockApi(page, 'Editor', state);
  await page.goto('/admin/materials/' + materialId);
  await page.getByLabel('Адрес в YouTube').fill('https://youtu.be/abcDEF123_0');
  await page.getByLabel('Транскрипция').fill('Редакционна транскрипция за архива.');
  await page.getByRole('button', { name: 'Добави времева точка' }).click();
  await page.getByLabel('Секунда от началото').fill('80');
  await page.getByLabel('Заглавие на точката').fill('Архивен разказ');
  await page.getByRole('button', { name: 'Запази редакцията' }).click();
  await expect(page.getByText('Записана е нова работна ревизия.')).toBeVisible();
  expect(state.material.draft.episode).toEqual({
    youtubeUrl: 'https://youtu.be/abcDEF123_0',
    transcript: 'Редакционна транскрипция за архива.',
    chapters: [{ startSeconds: 80, title: 'Архивен разказ' }],
  });
  await confirmAction(page, 'Публикувай');
  await expect(page.getByRole('link', { name: 'Виж публикацията' })).toBeVisible();
});

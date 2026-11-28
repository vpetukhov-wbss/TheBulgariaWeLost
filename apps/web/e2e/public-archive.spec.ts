import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const material = {
  id: '019a9451-2b60-7000-8000-000000000975',
  slug: 'spomen-ot-1964',
  title: 'Спомен от 1964 г.',
  type: 'Story',
  language: 'bg',
  summary: 'Архивна история от Стара Загора.',
};
const place = {
  id: '019a9451-2b60-7000-8000-000000000976',
  kind: 'places',
  name: 'Стара Загора',
  slug: 'stara-zagora',
};
const publishedMaterial = {
  ...material,
  revisionNumber: 1,
  content: {
    title: material.title,
    summary: material.summary,
    historicalYear: 1964,
    categoryIds: [],
    topicIds: [],
    sourceIds: [],
    mediaRefs: [],
    rights: { publicDisplayAllowed: true, statement: 'Проверено' },
  },
};

async function fixtures(page: Page) {
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/v1/archive/search') {
      const q = url.searchParams.get('q');
      if (q === 'грешка') return route.fulfill({ status: 503, json: {} });
      return route.fulfill({ json: { items: q === 'липсва' ? [] : [material] } });
    }
    if (url.pathname === '/api/v1/materials/' + material.slug) {
      return route.fulfill({ json: publishedMaterial });
    }
    if (url.pathname === '/api/v1/catalog/places') {
      return route.fulfill({ json: { items: [place] } });
    }
    if (url.pathname === '/api/v1/catalog/places/' + place.slug) {
      return route.fulfill({ json: { ...place, fields: {} } });
    }
    if (url.pathname === '/api/v1/site-settings') {
      return route.fulfill({
        json: {
          siteName: 'България, която изгубихме',
          banners: [],
          featuredMaterials: [],
          footerLinks: [],
          socialLinks: [],
        },
      });
    }
    return route.fulfill({ status: 404, json: {} });
  });
}

test('the archive retains shareable filters after keyboard navigation and back', async ({
  page,
}) => {
  await fixtures(page);
  await page.goto('/');
  await page.getByRole('link', { name: 'Разгледай архива' }).click();
  const search = page.getByRole('searchbox', { name: 'Търси в архива' });
  await search.fill('Спомен');
  await page.getByLabel('От година').fill('1964');
  await search.press('Enter');
  await expect(page).toHaveURL(/fromYear=1964/);
  const result = page.getByRole('link', { name: material.title });
  await result.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: material.title })).toBeVisible();
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute(
    'href',
    /\/materials\/spomen-ot-1964$/,
  );
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
    'content',
    material.summary,
  );
  await page.goBack();
  await expect(search).toHaveValue('Спомен');
  await expect(page.getByLabel('От година')).toHaveValue('1964');
  await expect(result).toBeVisible();
});

test('mobile archive opens places and renders empty, unavailable and retry states', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixtures(page);
  await page.goto('/archive/places');
  const request = page.waitForRequest((request) => request.url().includes('placeId=' + place.id));
  await page.getByRole('link', { name: place.name }).click();
  await request;
  await expect(page.getByRole('heading', { name: place.name })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.goto('/archive/periods?q=липсва');
  await expect(page.getByText('Няма материали по тези филтри.')).toBeVisible();
  await page.goto('/archive?q=грешка');
  await expect(page.getByRole('button', { name: 'Опитай отново' })).toBeVisible();
  await page.goto('/materials/withdrawn');
  await expect(page.getByText('Материалът е свален или вече е недостъпен.')).toBeVisible();
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'noindex,follow');
});

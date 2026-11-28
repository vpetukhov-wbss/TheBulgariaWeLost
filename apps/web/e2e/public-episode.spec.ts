import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { PublicMaterial } from '../src/app/api/generated/models/public-material';

const episode: PublicMaterial = {
  id: '019a9451-2b60-7000-8000-000000000987',
  slug: 'istorii-ot-arhiva',
  type: 'Episode',
  language: 'bg',
  revisionNumber: 1,
  content: {
    title: 'Истории от архива',
    summary: 'Епизод за Стара Загора.',
    categoryIds: [],
    topicIds: [],
    sourceIds: [],
    mediaRefs: [],
    rights: { publicDisplayAllowed: true, statement: 'Проверено' },
    episode: {
      transcript: 'Редактирана транскрипция на епизода.',
      chapters: [
        { startSeconds: 80, title: 'Спомен' },
        { startSeconds: 0, title: 'Начало' },
      ],
    },
  },
  episode: {
    youtubeVideoId: 'abcDEF123_0',
    sources: [{ id: 'source-a', title: 'Архивен опис', reference: 'ф. 18, оп. 3' }],
  },
};

async function fixtures(page: Page, material: PublicMaterial) {
  await page.route('https://www.youtube-nocookie.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>Тестов плеър</title>' }),
  );
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/materials/' + material.slug) return route.fulfill({ json: material });
    if (path === '/api/v1/site-settings') {
      return route.fulfill({
        json: {
          siteName: 'България, която изгубихме',
          banners: [],
          featuredMaterials: [],
          footerLinks: [],
          socialLinks: ['Facebook', 'Instagram', 'TikTok'].map((platform) => ({
            platform,
            url: 'https://www.' + platform.toLowerCase() + '.com/archive',
          })),
        },
      });
    }
    return route.fulfill({ status: 404, json: {} });
  });
}

test('an episode loads its video on demand and offers its transcript, sources and social links', async ({
  page,
}) => {
  await fixtures(page, episode);
  await page.goto('/materials/' + episode.slug);
  await expect(page.getByRole('heading', { name: episode.content.title })).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Начало/ })).toBeVisible();
  await page.getByRole('button', { name: /01:20 · Спомен/ }).press('Enter');
  await expect(page.locator('iframe')).toHaveAttribute(
    'src',
    'https://www.youtube-nocookie.com/embed/abcDEF123_0?start=80&autoplay=1',
  );
  await expect(page.getByRole('heading', { name: 'Транскрипция' })).toBeVisible();
  await expect(page.getByText('Редактирана транскрипция на епизода.')).toBeVisible();
  await expect(page.getByText(/Архивен опис/)).toBeVisible();
  const social = page.getByRole('navigation', { name: 'Социални канали на архива' });
  for (const name of ['Facebook', 'Instagram', 'TikTok']) {
    await expect(social.getByRole('link', { name })).toBeVisible();
  }
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    /\/assets\/episode-share\.png$/,
  );
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
    'content',
    /\/materials\/istorii-ot-arhiva$/,
  );
});

test('a mobile episode with unavailable video retains accessible text and sources', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await fixtures(page, { ...episode, episode: { ...episode.episode!, youtubeVideoId: 'invalid' } });
  await page.goto('/materials/' + episode.slug);
  await expect(page.getByText(/Видеото е недостъпно/)).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.getByText('00:00 · Начало', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Източници' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

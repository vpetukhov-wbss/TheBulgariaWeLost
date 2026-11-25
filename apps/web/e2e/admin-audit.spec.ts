import { type Page, expect, test } from '@playwright/test';
import type { AuditEventDetail } from '../src/app/api/generated/models/audit-event-detail';

const actorId = '019a9451-2b60-7000-8000-000000000801';
const eventId = '019a9451-2b60-7000-8000-000000000802';
const targetId = '019a9451-2b60-7000-8000-000000000803';
const asOfUtc = '2026-11-25T12:00:00.000Z';
const event: AuditEventDetail = {
  id: eventId,
  actorId,
  actorRole: 'Administrator',
  action: 'AccountRoleChanged',
  outcome: 'Succeeded',
  targetId,
  targetType: 'Account',
  occurredAtUtc: asOfUtc,
  traceId: 'account-role-request-trace',
  reason: 'Профилът е одобрен за редакторски достъп.',
  changeSummary: [{ field: 'role', value: 'Editor' }],
};

async function openPanel(page: Page, role: 'Administrator' | 'Editor') {
  const calls: URL[] = [];
  let submitted = 7;
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    const admin = role === 'Administrator';
    const user = {
      id: actorId,
      role,
      email: 'operator@example.test',
      firstName: 'Мария',
      lastName: 'Иванова',
      mfaEnabled: admin,
    };
    if (url.pathname === '/api/v1/auth/email/login') {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
      const token = [
        encode({ alg: 'HS256', typ: 'JWT' }),
        encode({ id: actorId, role, exp }),
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
          id: actorId,
          displayName: 'Мария Иванова',
          role,
          permissions: ['BackOffice.Access', ...(admin ? ['Audit.Read', 'Users.Manage'] : [])],
          ...(admin ? { mfaVerifiedAtUtc: asOfUtc } : {}),
        },
      });
    }
    if (url.pathname === '/api/admin/v1/dashboard') {
      return route.fulfill({
        json: {
          asOfUtc,
          submittedMaterials: submitted++,
          materialsInReview: 2,
          openModerationCases: 3,
          restrictedMedia: 4,
          ...(admin
            ? {
                administrative: {
                  bannedAccounts: 2,
                  failedPasswordResetsLast24Hours: 1,
                  auditEventsLast24Hours: 11,
                },
              }
            : {}),
        },
      });
    }
    if (url.pathname.startsWith('/api/admin/v1/audit-events')) {
      calls.push(url);
      if (url.pathname.endsWith(eventId)) return route.fulfill({ json: event });
      const filtered = url.searchParams.get('outcome') === 'Succeeded';
      if (filtered && !url.searchParams.has('cursor')) {
        return route.fulfill({ json: { items: [event], nextCursor: 'signed-page-cursor' } });
      }
      return route.fulfill({ json: { items: [] } });
    }
    return route.fulfill({ status: 404 });
  });

  await page.goto('/login');
  await page.getByLabel('Имейл').fill('operator@example.test');
  await page.getByLabel('Парола').fill('overview-test-' + Date.now());
  await page.getByRole('button', { name: 'Влез' }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Работен панел' })).toBeVisible();
  return calls;
}

test('refreshes editorial counts and restricts the journal to administrators', async ({ page }) => {
  const requests = await openPanel(page, 'Editor');
  const submitted = page.locator('dl div').filter({ hasText: 'Чакат преглед' });
  await expect(submitted.locator('dd')).toHaveText('7');
  await page.getByRole('button', { name: 'Обнови' }).click();
  await expect(submitted.locator('dd')).toHaveText('8');
  await expect(page.getByRole('heading', { name: 'Административен обзор' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Одитен журнал' })).toHaveCount(0);
  await page.goto('/admin/audit/' + eventId);
  await expect(page).toHaveURL(/\/forbidden$/);
  expect(requests).toHaveLength(0);
});

test('shows administrative counts and preserves audit filters through detail and pagination', async ({
  page,
}) => {
  const requests = await openPanel(page, 'Administrator');
  await expect(page.getByRole('heading', { name: 'Административен обзор' })).toBeVisible();
  await expect(
    page.locator('dl div').filter({ hasText: 'Одитни събития' }).locator('dd'),
  ).toHaveText('11');
  await page.getByRole('link', { name: 'Одитен журнал' }).click();
  await expect(page.getByText('Няма събития за избраните филтри.')).toBeVisible();
  await page.getByLabel('Резултат').selectOption('Succeeded');
  await page.getByLabel('Оператор (ID)').fill(actorId);
  await page.getByRole('button', { name: 'Филтрирай' }).click();
  await page.getByRole('link', { name: 'Следващи събития' }).click();
  await expect(page).toHaveURL(/cursor=signed-page-cursor/);
  await expect(page.getByText('Няма събития за избраните филтри.')).toBeVisible();
  await page.getByRole('link', { name: 'Първа страница' }).click();
  await page.getByRole('link', { name: 'Промяна на роля' }).click();
  await expect(page.getByText(event.traceId, { exact: true })).toBeVisible();
  await expect(page.getByText(event.reason!, { exact: true })).toBeVisible();
  await expect(page.getByText('Нова роля', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Одитен журнал' }).click();
  await expect(page.getByLabel('Резултат')).toHaveValue('Succeeded');
  await expect(page.getByLabel('Оператор (ID)')).toHaveValue(actorId);
  expect(requests.some((url) => url.searchParams.get('actorId') === actorId)).toBe(true);
});

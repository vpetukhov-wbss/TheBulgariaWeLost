import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { mongo } from 'mongoose';
import request from 'supertest';
import { parse } from 'yaml';

const databaseUrl = new URL(
  process.env.API_TEST_DATABASE_URL ??
    'mongodb://127.0.0.1:27017/bulgaria_archive?replicaSet=rs0&directConnection=true',
);
databaseUrl.pathname = `/archive_e2e_${randomUUID().replaceAll('-', '')}`;
const port = Number(process.env.API_TEST_PORT ?? 3011);
const baseUrl = `http://127.0.0.1:${port}`;
const api = request(baseUrl);
const db = new mongo.MongoClient(databaseUrl.toString(), {
  serverSelectionTimeoutMS: 4_500,
});
const mailUrl = process.env.MAILPIT_TEST_URL ?? 'http://127.0.0.1:8025';
const auth = '/api/v1/auth';
const details = {
  firstName: 'Мария',
  lastName: 'Димова',
  password: 'first-test-password',
};
let child: ChildProcess | undefined;
let serverLog = '';

interface Tokens {
  token: string;
  refreshToken: string;
  tokenExpires: number;
}

async function waitForApi() {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (child?.exitCode !== null) break;
    try {
      const response = await fetch(baseUrl + '/api/v1/health', {
        signal: AbortSignal.timeout(800),
      });
      if (response.ok) return;
    } catch {
      // The API is still starting.
    }
    await delay(200);
  }
  throw new Error(`Test API did not start.\n${serverLog}`);
}

async function mailHash(email: string, path: string): Promise<string> {
  const query = new URL('/api/v1/search', mailUrl);
  query.searchParams.set('query', `to:${email}`);
  for (let attempt = 0; attempt < 20; attempt++) {
    const list = await fetch(query);
    if (!list.ok)
      throw new Error(`Mailpit search failed with status ${list.status}`);
    const data = (await list.json()) as { messages: { ID: string }[] };
    for (const item of data.messages) {
      const response = await fetch(
        new URL(`/api/v1/message/${item.ID}`, mailUrl),
      );
      const message = (await response.json()) as { Text: string };
      for (const url of message.Text.match(/https?:\/\/[^\s<>]+/g) ?? []) {
        const link = new URL(url);
        const hash = link.searchParams.get('hash');
        if (link.pathname === path && hash) return hash;
      }
    }
    await delay(200);
  }
  throw new Error(`Mailpit has no message containing a ${path} link`);
}

async function register(email: string): Promise<void> {
  await api
    .post(auth + '/email/register')
    .send({ ...details, email })
    .expect(204);
}

async function confirm(email: string): Promise<void> {
  const hash = await mailHash(email, '/confirm-email');
  await api
    .post(auth + '/email/confirm')
    .send({ hash })
    .expect(204);
}

async function login(
  email: string,
  password = details.password,
): Promise<Tokens> {
  const result = await api
    .post(auth + '/email/login')
    .send({ email, password })
    .expect(200);
  return result.body as Tokens;
}

void describe('NestJS archive API', { timeout: 30_000 }, () => {
  before(async () => {
    await db.connect();
    const hello: { setName?: string } = await db
      .db()
      .admin()
      .command({ hello: 1 });
    if (!hello.setName)
      throw new Error('The e2e suite requires a MongoDB replica set.');
    child = spawn(process.execPath, ['dist/main'], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        APP_PORT: String(port),
        FRONTEND_DOMAIN: process.env.FRONTEND_DOMAIN ?? 'http://127.0.0.1:4200',
        DATABASE_URL: databaseUrl.toString(),
        MAIL_HOST: '127.0.0.1',
        MAIL_PORT: process.env.API_TEST_SMTP_PORT ?? '1025',
        MAIL_DEFAULT_EMAIL:
          process.env.MAIL_DEFAULT_EMAIL ?? 'noreply@example.test',
        MAIL_DEFAULT_NAME:
          process.env.MAIL_DEFAULT_NAME ?? 'The Bulgaria We Lost tests',
        MAIL_USER: '',
        MAIL_PASSWORD: '',
        MAIL_IGNORE_TLS: 'true',
        MAIL_SECURE: 'false',
        MAIL_REQUIRE_TLS: 'false',
        AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET ?? 'secret',
        AUTH_REFRESH_SECRET:
          process.env.AUTH_REFRESH_SECRET ?? 'secret_for_refresh',
        AUTH_FORGOT_SECRET:
          process.env.AUTH_FORGOT_SECRET ?? 'secret_for_forgot',
        AUTH_CONFIRM_EMAIL_SECRET:
          process.env.AUTH_CONFIRM_EMAIL_SECRET ?? 'secret_for_confirm_email',
        AUTH_JWT_TOKEN_EXPIRES_IN:
          process.env.AUTH_JWT_TOKEN_EXPIRES_IN ?? '15m',
        AUTH_REFRESH_TOKEN_EXPIRES_IN:
          process.env.AUTH_REFRESH_TOKEN_EXPIRES_IN ?? '30d',
        AUTH_FORGOT_TOKEN_EXPIRES_IN:
          process.env.AUTH_FORGOT_TOKEN_EXPIRES_IN ?? '30m',
        AUTH_CONFIRM_EMAIL_TOKEN_EXPIRES_IN:
          process.env.AUTH_CONFIRM_EMAIL_TOKEN_EXPIRES_IN ?? '1d',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (chunk: Buffer) => {
      serverLog += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      serverLog += chunk.toString();
    });
    await waitForApi();
  });

  after(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exit = once(child, 'exit');
      child.kill();
      await exit;
    }
    try {
      await db.db().dropDatabase();
    } finally {
      await db.close();
    }
  });

  void it('should publish the versioned routes and health check', async () => {
    const correlationId = 'contract-smoke-1';
    await api
      .get('/api/v1/health')
      .set('X-Correlation-ID', correlationId)
      .expect('X-Correlation-ID', correlationId)
      .expect(200, { status: 'ok' });
    const openApi = await api.get('/docs-json').expect(200);
    const generated = openApi.body as {
      paths: Record<string, Record<string, unknown>>;
    };
    const routes = Object.keys(generated.paths);
    assert(routes.includes('/api/v1/auth/email/login'));
    assert(routes.includes('/api/admin/v1/me'));

    const contract = parse(
      await readFile(
        resolve(process.cwd(), '../../contracts/openapi/v1.yaml'),
        'utf8',
      ),
    ) as { paths: Record<string, Record<string, unknown>> };
    const contractRoutes = Object.keys(contract.paths).filter((path) =>
      path.startsWith('/api/'),
    );
    assert.deepEqual(routes.sort(), contractRoutes.sort());
    for (const path of routes) {
      const methods = (item: Record<string, unknown>) =>
        Object.keys(item).filter((key) =>
          ['get', 'put', 'post', 'delete', 'patch', 'head'].includes(key),
        );
      assert.deepEqual(
        methods(generated.paths[path]).sort(),
        methods(contract.paths[path]).sort(),
      );
    }
  });

  void it('should return the shared Problem Details envelope', async () => {
    const correlationId = 'contract-problem-1';
    const problem = await api
      .post(auth + '/email/login')
      .set('X-Correlation-ID', correlationId)
      .send({ email: 'not-an-email', password: 'short' })
      .expect('Content-Type', /application\/problem\+json/)
      .expect('X-Correlation-ID', correlationId)
      .expect(422);

    assert.equal(problem.body.status, 422);
    assert.equal(problem.body.traceId, correlationId);
    assert.equal(typeof problem.body.code, 'string');
  });

  void it('should require email confirmation and prevent registration from choosing a role', async () => {
    const email = `${randomUUID()}@example.test`;
    await api
      .post(auth + '/email/register')
      .send({ ...details, email, role: 'Administrator' })
      .expect(204);
    await api
      .post(auth + '/email/login')
      .send({ email, password: details.password })
      .expect(422);
    await confirm(email);
    const { token } = await login(email);
    const profile = await api
      .get(auth + '/me')
      .auth(token, { type: 'bearer' })
      .expect(200);
    const profileBody = profile.body as Record<string, unknown>;
    assert.equal(profileBody.email, email);
    assert.equal(profileBody.firstName, details.firstName);
    assert.equal(profileBody.role, 'User');
    assert(!('passwordHash' in profileBody));
    assert.equal(profile.headers['cache-control'], 'no-store');
    await api
      .get('/api/admin/v1/me')
      .auth(token, { type: 'bearer' })
      .expect(403);
  });

  void it('should rotate once under concurrent refresh and reject access after logout', async () => {
    const email = `${randomUUID()}@example.test`;
    await register(email);
    await confirm(email);
    const { refreshToken } = await login(email);
    const call = () =>
      api.post(auth + '/refresh').auth(refreshToken, { type: 'bearer' });
    const results = await Promise.all([call(), call()]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 401]);
    const success = results.find((r) => r.status === 200);
    if (!success) throw new Error('Expected a successful refresh');
    const next = success.body as Tokens;
    assert.notEqual(next.refreshToken, refreshToken);
    await api
      .post(auth + '/logout')
      .auth(next.token, { type: 'bearer' })
      .expect(204);
    await api
      .get(auth + '/me')
      .auth(next.token, { type: 'bearer' })
      .expect(401);
    await api
      .post(auth + '/refresh')
      .auth(next.refreshToken, { type: 'bearer' })
      .expect(401);
  });

  void it('should accept one parallel password reset and revoke the previous session', async () => {
    const email = `${randomUUID()}@example.test`;
    await register(email);
    await confirm(email);
    const old = await login(email);
    await api
      .post(auth + '/forgot/password')
      .send({ email: 'missing@example.test' })
      .expect(204);
    await api
      .post(auth + '/forgot/password')
      .send({ email })
      .expect(204);
    const hash = await mailHash(email, '/password-change');
    const password = 'second-test-password';
    const call = () =>
      api.post(auth + '/reset/password').send({ hash, password });
    const results = await Promise.all([call(), call()]);
    assert.deepEqual(results.map((r) => r.status).sort(), [204, 422]);
    await api
      .get(auth + '/me')
      .auth(old.token, { type: 'bearer' })
      .expect(401);
    await api
      .post(auth + '/refresh')
      .auth(old.refreshToken, { type: 'bearer' })
      .expect(401);
    await login(email, password);
  });

  void it('should use the current stored role and require MFA for administrators', async () => {
    const email = `${randomUUID()}@example.test`;
    await register(email);
    await confirm(email);
    const users = db.db().collection('users');
    await users.updateOne(
      { email },
      { $set: { role: 'Editor' }, $inc: { authVersion: 1 } },
    );
    const editor = await login(email);
    const principal = await api
      .get('/api/admin/v1/me')
      .auth(editor.token, { type: 'bearer' })
      .expect(200);
    const principalBody = principal.body as Record<string, unknown>;
    assert.equal(principalBody.role, 'Editor');
    assert.deepEqual(principalBody.permissions, [
      'BackOffice.Access',
      'Editorial.Manage',
    ]);
    await users.updateOne(
      { email },
      { $set: { role: 'Administrator' }, $inc: { authVersion: 1 } },
    );
    await api
      .get('/api/admin/v1/me')
      .auth(editor.token, { type: 'bearer' })
      .expect(401);
    const admin = await login(email);
    const denied = await api
      .get('/api/admin/v1/me')
      .auth(admin.token, { type: 'bearer' })
      .expect(403);
    assert.equal((denied.body as { code: string }).code, 'mfa_required');
    assert.match(
      String(denied.headers['content-type']),
      /application\/problem\+json/,
    );
  });
});

import 'dotenv/config';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { mongo } from 'mongoose';
import request from 'supertest';
import { parse } from 'yaml';
import { uuidv7 } from 'uuidv7';

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
const randomCredential = (prefix: string) => `${prefix}-${randomUUID()}`;
const details = {
  firstName: 'Мария',
  lastName: 'Димова',
  password: randomCredential('User'),
};
let child: ChildProcess | undefined;
let serverLog = '';
const sensitiveSamples: string[] = [];
const execFileAsync = promisify(execFile);
const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const mediaServiceToken = `${randomUUID()}${randomUUID()}`;
const mediaGrantSecret = `${randomUUID()}${randomUUID()}`;
const mediaReadGrantSecret = `${randomUUID()}${randomUUID()}`;
const mediaProbeToken = `${randomUUID()}${randomUUID()}`;
const storageProbes: string[] = [];
const storageService = createServer((request, response) => {
  if (request.headers.authorization !== 'Bearer ' + mediaProbeToken) {
    response.writeHead(401).end();
  } else if (
    request.method === 'GET' &&
    request.url === '/internal/media/v1/storage/profiles'
  ) {
    response.setHeader('Content-Type', 'application/json');
    response.end(
      JSON.stringify(['archive', 'secondary', 'denied', 'offline', 'spare']),
    );
  } else {
    const profile = request.url?.match(
      /^\/internal\/media\/v1\/storage\/([a-z]+)\/probe$/,
    )?.[1];
    if (request.method !== 'POST' || !profile) {
      response.writeHead(404).end();
      return;
    }
    storageProbes.push(profile);
    if (profile === 'denied') {
      response.writeHead(403, { 'Content-Type': 'application/problem+json' });
      response.end(JSON.stringify({ code: 'storage_access_denied' }));
    } else {
      response.writeHead(profile === 'offline' ? 503 : 204).end();
    }
  }
});
const authJwtSecret = randomCredential('Jwt');
const authRefreshSecret = randomCredential('Refresh');
const authForgotSecret = randomCredential('Forgot');
const authConfirmSecret = randomCredential('Confirm');
const authClientIps = new Map<string, string>();
sensitiveSamples.push(details.password, mediaServiceToken, mediaProbeToken);

function authClientIp(email: string): string {
  const existing = authClientIps.get(email);
  if (existing) return existing;
  const address = `203.0.113.${authClientIps.size + 1}`;
  authClientIps.set(email, address);
  return address;
}

interface Tokens {
  token: string;
  refreshToken: string;
  tokenExpires: number;
}

interface UploadSession {
  uploadId: string;
  uploadUrl: string;
  grant: string;
  expiresAtUtc: string;
  maxBytes: number;
  attemptVersion: number;
  length: number;
  sha256: string;
}

interface UploadRecord {
  _id: string;
  accountId: string;
  sessionId: string;
  status: string;
  storageLocationId: string;
  fileKey: string;
  expiresAt: Date;
  leaseExpiresAt?: Date;
  activeAttemptId?: string;
  contentType?: string;
  alternativeText?: string;
  rightsEvidence?: string;
  correlationId?: string;
  schemaVersion?: number;
  processingStatus?: string;
  inspectionLeaseExpiresAt?: Date;
  inspectionAttemptId?: string;
  previewFileKey?: string;
  accessStatus?: string;
  accessVersion?: number;
}

interface MaterialResponse {
  id: string;
  slug: string;
  status: string;
  workingStatus?: string;
  workingRevisionNumber?: number;
  publishedRevisionNumber?: number;
  draft: { title: string };
  version: number;
}

interface CatalogResponse {
  id: string;
  slug: string;
  status: string;
  canonicalId?: string;
  version: number;
  fields: Record<string, unknown>;
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
    .set('X-Forwarded-For', authClientIp(email))
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
    .set('X-Forwarded-For', authClientIp(email))
    .send({ email, password })
    .expect(200);
  return result.body as Tokens;
}

async function createEditor(): Promise<{
  id: string;
  email: string;
  token: string;
}> {
  const email = `${randomUUID()}@example.test`;
  await register(email);
  await confirm(email);
  const users = db.db().collection<{ _id: string; email: string }>('users');
  await users.updateOne(
    { email },
    { $set: { role: 'Editor' }, $inc: { authVersion: 1 } },
  );
  const account = await users.findOne({ email });
  if (!account) throw new Error('Expected the editor account to exist.');
  const signedIn = await login(email);
  return { id: account._id, email, token: signedIn.token };
}

async function createAdministrator(): Promise<{
  id: string;
  email: string;
  token: string;
}> {
  const email = `${randomUUID()}@example.test`;
  await register(email);
  await confirm(email);
  const users = db.db().collection<{ _id: string; email: string }>('users');
  await users.updateOne(
    { email },
    {
      $set: { role: 'Administrator', mfaEnabled: true },
      $inc: { authVersion: 1 },
    },
  );
  const account = await users.findOne({ email });
  if (!account) throw new Error('Expected the administrator account to exist.');
  const signedIn = await login(email);
  await db
    .db()
    .collection('sessions')
    .updateOne(
      { accountId: account._id },
      { $set: { mfaVerifiedAt: new Date() } },
    );
  return { id: account._id, email, token: signedIn.token };
}

async function createUpload(
  token: string,
  length = 128,
  metadata: { alternativeText?: string; rightsEvidence?: string } = {},
  correlationId?: string,
): Promise<UploadSession> {
  const sha256 = createHash('sha256')
    .update(`${randomUUID()}:${length}`)
    .digest('hex');
  const request = api
    .post('/api/v1/media/uploads')
    .auth(token, { type: 'bearer' });
  if (correlationId) request.set('X-Correlation-ID', correlationId);
  const response = await request
    .send({ purpose: 'material-original', length, sha256, ...metadata })
    .expect(201);
  if (correlationId) {
    assert.equal(response.headers['x-correlation-id'], correlationId);
  }
  const session = response.body as Omit<UploadSession, 'length' | 'sha256'>;
  sensitiveSamples.push(session.grant);
  return { ...session, length, sha256 };
}

function claimUpload(upload: UploadSession) {
  return api
    .post(`/internal/media/v1/uploads/${upload.uploadId}/claim`)
    .auth(mediaServiceToken, { type: 'bearer' })
    .send({ grant: upload.grant });
}

function completeUpload(
  upload: UploadSession,
  attemptId: string,
  overrides: Partial<{
    length: number;
    sha256: string;
    contentType: string;
  }> = {},
) {
  return api
    .post(`/internal/media/v1/uploads/${upload.uploadId}/complete`)
    .auth(mediaServiceToken, { type: 'bearer' })
    .send({
      attemptId,
      length: upload.length,
      sha256: upload.sha256,
      contentType: 'image/png',
      ...overrides,
    });
}

function leaseInspection() {
  return api
    .post('/internal/media/v1/inspections/lease')
    .auth(mediaServiceToken, { type: 'bearer' })
    .send({});
}

function completeInspection(jobId: string, body: Record<string, unknown>) {
  return api
    .post(`/internal/media/v1/inspections/${jobId}/complete`)
    .auth(mediaServiceToken, { type: 'bearer' })
    .send(body);
}

async function createReadGrant(
  token: string,
  assetId: string,
  variant: 'original' | 'preview',
) {
  const response = await api
    .post(`/api/v1/media/assets/${assetId}/read-grants`)
    .auth(token, { type: 'bearer' })
    .send({ variant })
    .expect(201);
  const body = response.body as {
    assetId: string;
    variant: 'original' | 'preview';
    grant: string;
    url: string;
    expiresAtUtc: string;
  };
  sensitiveSamples.push(body.grant);
  return body;
}

function authorizeRead(
  assetId: string,
  variant: 'original' | 'preview',
  grant: string,
) {
  return api
    .post(`/internal/media/v1/assets/${assetId}/authorize-read`)
    .auth(mediaServiceToken, { type: 'bearer' })
    .send({ variant, grant });
}

function totp(secret: string, step = Math.floor(Date.now() / 30_000)): string {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const character of secret) {
    value = (value << 5) | base32Alphabet.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', Buffer.from(bytes))
    .update(counter)
    .digest();
  const offset = digest[digest.length - 1] & 15;
  const binary =
    (((digest[offset] & 127) << 24) |
      (digest[offset + 1] << 16) |
      (digest[offset + 2] << 8) |
      digest[offset + 3]) >>>
    0;
  return String(binary % 1_000_000).padStart(6, '0');
}

function bootstrapAdmin(email: string, password: string) {
  return execFileAsync(process.execPath, ['scripts/bootstrap-admin.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl.toString(),
      ADMIN_BOOTSTRAP_CONFIRM: 'CREATE_FIRST_ADMIN',
      ADMIN_BOOTSTRAP_EMAIL: email,
      ADMIN_BOOTSTRAP_PASSWORD: password,
    },
  });
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
    storageService.listen(0, '127.0.0.1');
    await once(storageService, 'listening');
    const probeAddress = storageService.address();
    if (!probeAddress || typeof probeAddress === 'string') {
      throw new Error('Unable to start the storage probe fixture.');
    }
    child = spawn(process.execPath, ['dist/main'], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        APP_PORT: String(port),
        APP_TRUST_PROXY_HOPS: '1',
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
        AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET ?? authJwtSecret,
        AUTH_REFRESH_SECRET:
          process.env.AUTH_REFRESH_SECRET ?? authRefreshSecret,
        AUTH_FORGOT_SECRET: process.env.AUTH_FORGOT_SECRET ?? authForgotSecret,
        AUTH_CONFIRM_EMAIL_SECRET:
          process.env.AUTH_CONFIRM_EMAIL_SECRET ?? authConfirmSecret,
        AUTH_MFA_ENCRYPTION_KEY:
          process.env.AUTH_MFA_ENCRYPTION_KEY ??
          'test-only-mfa-encryption-key-material',
        MEDIA_SERVICE_TOKEN: mediaServiceToken,
        MEDIA_UPLOAD_GRANT_SECRET: mediaGrantSecret,
        MEDIA_READ_GRANT_SECRET: mediaReadGrantSecret,
        MEDIA_DEFAULT_STORAGE_LOCATION_ID: 'archive',
        MEDIA_PROBE_ORIGIN: `http://127.0.0.1:${probeAddress.port}`,
        MEDIA_PROBE_TOKEN: mediaProbeToken,
        MEDIA_ACCOUNT_QUOTA_BYTES: '1024',
        MEDIA_MAX_UPLOAD_BYTES: '33554432',
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
    storageService.close();
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
    const contractRoutes = Object.keys(contract.paths).filter(
      (path) =>
        path.startsWith('/api/') ||
        (path.startsWith('/internal/media/v1/') &&
          !path.startsWith('/internal/media/v1/storage/')),
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
    const password = randomCredential('Reset');
    sensitiveSamples.push(password);
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

  void it('should use the current stored role and revoke tokens after a role change', async () => {
    const email = `${randomUUID()}@example.test`;
    await register(email);
    await confirm(email);
    const user = await login(email);
    const users = db.db().collection('users');
    await users.updateOne(
      { email },
      { $set: { role: 'Editor' }, $inc: { authVersion: 1 } },
    );
    await api
      .get(auth + '/me')
      .auth(user.token, { type: 'bearer' })
      .expect(401);
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
  });

  void it('should bootstrap one administrator, verify MFA and consume recovery codes once', async () => {
    const email = `admin-${randomUUID()}@example.test`;
    const password = `Admin-${randomUUID()}-password`;
    sensitiveSamples.push(password);
    const bootstrap = await bootstrapAdmin(email, password);
    assert.match(bootstrap.stdout, /Created the first administrator/);
    assert(!bootstrap.stdout.includes(password));
    await assert.rejects(
      bootstrapAdmin(`second-${email}`, password),
      /administrator already exists/i,
    );

    const first = await login(email, password);
    sensitiveSamples.push(first.token, first.refreshToken);
    await api.get('/api/admin/v1/me').expect(401);
    const mfaRequired = await api
      .get('/api/admin/v1/me')
      .auth(first.token, { type: 'bearer' })
      .expect(403);
    assert.equal((mfaRequired.body as { code: string }).code, 'mfa_required');
    await api
      .post(auth + '/mfa/enrollment')
      .auth(first.token, { type: 'bearer' })
      .send({ currentPassword: randomCredential('Wrong') })
      .expect(422);
    const enrollment = await api
      .post(auth + '/mfa/enrollment')
      .auth(first.token, { type: 'bearer' })
      .send({ currentPassword: password })
      .expect(200);
    const secret = (enrollment.body as { secret: string }).secret;
    sensitiveSamples.push(secret);
    assert.match(secret, /^[A-Z2-7]{32}$/);
    assert.match(
      (enrollment.body as { provisioningUri: string }).provisioningUri,
      /^otpauth:\/\/totp\//,
    );
    const confirmed = await api
      .post(auth + '/mfa/enrollment/confirm')
      .auth(first.token, { type: 'bearer' })
      .send({ code: totp(secret) })
      .expect(200);
    const codes = (confirmed.body as { recoveryCodes: string[] }).recoveryCodes;
    assert.equal(codes.length, 10);
    sensitiveSamples.push(...codes);
    const principal = await api
      .get('/api/admin/v1/me')
      .auth(first.token, { type: 'bearer' })
      .expect(200);
    assert.equal((principal.body as { role: string }).role, 'Administrator');
    assert.equal(
      typeof (principal.body as { mfaVerifiedAtUtc: string }).mfaVerifiedAtUtc,
      'string',
    );

    const second = await login(email, password);
    await api
      .get('/api/admin/v1/me')
      .auth(second.token, { type: 'bearer' })
      .expect(403);
    await api
      .post(auth + '/mfa/verify')
      .auth(second.token, { type: 'bearer' })
      .send({ code: totp(secret, Math.floor(Date.now() / 30_000) + 1) })
      .expect(204);
    await api
      .get('/api/admin/v1/me')
      .auth(second.token, { type: 'bearer' })
      .expect(200);

    const recovered = await login(email, password);
    await api
      .post(auth + '/mfa/recover')
      .auth(recovered.token, { type: 'bearer' })
      .send({ recoveryCode: codes[0] })
      .expect(204);
    await api
      .get('/api/admin/v1/me')
      .auth(recovered.token, { type: 'bearer' })
      .expect(200);
    const replay = await login(email, password);
    await api
      .post(auth + '/mfa/recover')
      .auth(replay.token, { type: 'bearer' })
      .send({ recoveryCode: codes[0] })
      .expect(422);

    await api
      .post(auth + '/logout/all')
      .auth(second.token, { type: 'bearer' })
      .expect(204);
    for (const token of [first.token, second.token, recovered.token]) {
      await api
        .get(auth + '/me')
        .auth(token, { type: 'bearer' })
        .expect(401);
    }
    await api
      .post(auth + '/refresh')
      .auth(first.refreshToken, { type: 'bearer' })
      .expect(401);
  });

  void it('should atomically claim and idempotently complete a bound upload grant', async () => {
    const email = `${randomUUID()}@example.test`;
    await register(email);
    await confirm(email);
    const signedIn = await login(email);
    const correlationId = `upload-acceptance-${randomUUID()}`;
    const upload = await createUpload(
      signedIn.token,
      256,
      {
        alternativeText: 'Архивна снимка на заводския двор.',
        rightsEvidence: 'Личен архив; писмено разрешение от дарителя.',
      },
      correlationId,
    );
    assert.match(upload.uploadUrl, new RegExp(`${upload.uploadId}$`));
    assert.equal(upload.maxBytes, upload.length);
    assert.equal(upload.attemptVersion, 1);

    const persisted = await db
      .db()
      .collection<UploadRecord>('mediaUploads')
      .findOne({ _id: upload.uploadId });
    assert.equal(persisted?.storageLocationId, 'archive');
    assert.match(persisted?.fileKey ?? '', /^[a-f0-9]{64}$/);
    assert.match(persisted?.sessionId ?? '', /^[0-9a-f-]{36}$/);
    assert.equal(
      persisted?.alternativeText,
      'Архивна снимка на заводския двор.',
    );
    assert.equal(
      persisted?.rightsEvidence,
      'Личен архив; писмено разрешение от дарителя.',
    );
    assert.equal(persisted?.correlationId, correlationId);
    assert.equal(persisted?.schemaVersion, 3);

    await api
      .post(`/internal/media/v1/uploads/${upload.uploadId}/claim`)
      .send({ grant: upload.grant })
      .expect(401);
    const claims = await Promise.all([
      claimUpload(upload),
      claimUpload(upload),
    ]);
    assert.deepEqual(
      claims.map((response) => response.status).sort(),
      [200, 409],
    );
    const accepted = claims.find((response) => response.status === 200);
    if (!accepted) throw new Error('Expected one accepted upload claim.');
    const claim = accepted.body as {
      attemptId: string;
      attemptVersion: number;
      object: { storageLocationId: string; fileKey: string };
      length: number;
      sha256: string;
    };
    assert.equal(claim.attemptVersion, 1);
    assert.equal(claim.object.storageLocationId, 'archive');
    assert.equal(claim.length, upload.length);
    assert.equal(claim.sha256, upload.sha256);

    await completeUpload(upload, claim.attemptId, {
      length: upload.length + 1,
    }).expect(422);
    await completeUpload(upload, claim.attemptId, {
      sha256: '0'.repeat(64),
    }).expect(422);
    await completeUpload(upload, claim.attemptId).expect(204);
    await completeUpload(upload, claim.attemptId).expect(204);
    await completeUpload(upload, claim.attemptId, {
      contentType: 'application/pdf',
    }).expect(409);

    const completed = await db
      .db()
      .collection<UploadRecord>('mediaUploads')
      .findOne({ _id: upload.uploadId });
    assert.equal(completed?.status, 'Completed');
    assert.equal(completed?.contentType, 'image/png');

    const asset = await api
      .get(`/api/v1/media/assets/${upload.uploadId}`)
      .auth(signedIn.token, { type: 'bearer' })
      .expect(200);
    assert.equal(
      asset.body.alternativeText,
      'Архивна снимка на заводския двор.',
    );
    assert.equal(
      asset.body.rightsEvidence,
      'Личен архив; писмено разрешение от дарителя.',
    );
    assert.equal(asset.body.correlationId, correlationId);
  });

  void it('should reject revoked and expired sessions and replace an expired claim lease', async () => {
    const email = `${randomUUID()}@example.test`;
    await register(email);
    await confirm(email);
    const firstLogin = await login(email);
    const revoked = await createUpload(firstLogin.token);
    await api
      .post(auth + '/logout')
      .auth(firstLogin.token, { type: 'bearer' })
      .expect(204);
    const revokedClaim = await claimUpload(revoked).expect(403);
    assert.equal(revokedClaim.body.code, 'upload_session_revoked');

    const active = await login(email);
    const expired = await createUpload(active.token);
    const uploads = db.db().collection<UploadRecord>('mediaUploads');
    await uploads.updateOne(
      { _id: expired.uploadId },
      { $set: { expiresAt: new Date(Date.now() - 1_000) } },
    );
    const expiredClaim = await claimUpload(expired).expect(403);
    assert.equal(expiredClaim.body.code, 'upload_grant_expired');

    const retried = await createUpload(active.token);
    const firstClaim = await claimUpload(retried).expect(200);
    await uploads.updateOne(
      { _id: retried.uploadId },
      { $set: { leaseExpiresAt: new Date(Date.now() - 1_000) } },
    );
    const secondClaim = await claimUpload(retried).expect(200);
    assert.notEqual(firstClaim.body.attemptId, secondClaim.body.attemptId);
    await completeUpload(retried, firstClaim.body.attemptId).expect(409);
    await completeUpload(retried, secondClaim.body.attemptId).expect(204);
  });

  void it('should lease inspection idempotently and revoke prior read grants immediately', async () => {
    const email = `${randomUUID()}@example.test`;
    await register(email);
    await confirm(email);
    const signedIn = await login(email);
    const upload = await createUpload(signedIn.token, 384);
    const uploadClaim = await claimUpload(upload).expect(200);
    await completeUpload(upload, uploadClaim.body.attemptId).expect(204);

    const uploads = db.db().collection<UploadRecord>('mediaUploads');
    await uploads.updateMany(
      { _id: { $ne: upload.uploadId }, status: 'Completed' },
      { $set: { processingStatus: 'Failed' } },
    );

    await api.post('/internal/media/v1/inspections/lease').send({}).expect(401);
    const firstLease = await leaseInspection().expect(200);
    assert.equal(firstLease.body.jobId, upload.uploadId);
    assert.match(firstLease.body.previewObject.fileKey, /^[a-f0-9]{64}$/);
    assert.notEqual(
      firstLease.body.previewObject.fileKey,
      firstLease.body.object.fileKey,
    );
    await leaseInspection().expect(204);

    await uploads.updateOne(
      { _id: upload.uploadId },
      { $set: { inspectionLeaseExpiresAt: new Date(Date.now() - 1_000) } },
    );
    const secondLease = await leaseInspection().expect(200);
    assert.notEqual(firstLease.body.attemptId, secondLease.body.attemptId);
    assert.notEqual(
      firstLease.body.previewObject.fileKey,
      secondLease.body.previewObject.fileKey,
    );

    const acceptedResult = {
      attemptId: secondLease.body.attemptId as string,
      outcome: 'inspected',
      length: upload.length,
      sha256: upload.sha256,
      contentType: 'image/png',
      previewObject: secondLease.body.previewObject as Record<string, string>,
      previewLength: upload.length,
      previewSha256: upload.sha256,
      previewContentType: 'image/png',
    };
    await completeInspection(upload.uploadId, {
      ...acceptedResult,
      attemptId: firstLease.body.attemptId,
      previewObject: firstLease.body.previewObject,
    }).expect(409);
    await completeInspection(upload.uploadId, {
      ...acceptedResult,
      previewObject: {
        ...secondLease.body.previewObject,
        fileKey: '0'.repeat(64),
      },
    }).expect(422);
    await completeInspection(upload.uploadId, acceptedResult).expect(204);
    await completeInspection(upload.uploadId, acceptedResult).expect(204);
    await completeInspection(upload.uploadId, {
      ...acceptedResult,
      previewSha256: '0'.repeat(64),
    }).expect(409);

    const asset = await api
      .get(`/api/v1/media/assets/${upload.uploadId}`)
      .auth(signedIn.token, { type: 'bearer' })
      .expect(200);
    assert.equal(asset.body.processingStatus, 'Ready');
    assert.deepEqual(asset.body.variants, ['original', 'preview']);

    const previewGrant = await createReadGrant(
      signedIn.token,
      upload.uploadId,
      'preview',
    );
    assert.equal(
      previewGrant.url,
      `${upload.uploadUrl.replace('/uploads/', '/assets/')}/preview`,
    );
    await api
      .post(`/internal/media/v1/assets/${upload.uploadId}/authorize-read`)
      .send({ variant: 'preview', grant: previewGrant.grant })
      .expect(401);
    const previewDecision = await authorizeRead(
      upload.uploadId,
      'preview',
      previewGrant.grant,
    ).expect(200);
    assert.equal(
      previewDecision.body.object.fileKey,
      secondLease.body.previewObject.fileKey,
    );
    await authorizeRead(upload.uploadId, 'original', previewGrant.grant).expect(
      403,
    );

    await uploads.updateOne(
      { _id: upload.uploadId },
      { $set: { accessStatus: 'Hidden' } },
    );
    const hidden = await authorizeRead(
      upload.uploadId,
      'preview',
      previewGrant.grant,
    ).expect(403);
    assert.equal(hidden.body.code, 'media_access_revoked');
    await uploads.updateOne(
      { _id: upload.uploadId },
      { $set: { accessStatus: 'Active' } },
    );
    await api
      .post(auth + '/logout')
      .auth(signedIn.token, { type: 'bearer' })
      .expect(204);
    const revoked = await authorizeRead(
      upload.uploadId,
      'preview',
      previewGrant.grant,
    ).expect(403);
    assert.equal(revoked.body.code, 'media_session_revoked');
  });

  void it('should enforce quota and release an expired reservation transactionally', async () => {
    const email = `${randomUUID()}@example.test`;
    await register(email);
    await confirm(email);
    const signedIn = await login(email);
    const first = await createUpload(signedIn.token, 800);
    await claimUpload(first).expect(200);
    await api
      .post('/api/v1/media/uploads')
      .auth(signedIn.token, { type: 'bearer' })
      .send({
        purpose: 'source-document',
        length: 800,
        sha256: createHash('sha256').update('quota').digest('hex'),
      })
      .expect(413);

    await db
      .db()
      .collection<UploadRecord>('mediaUploads')
      .updateOne(
        { _id: first.uploadId },
        { $set: { expiresAt: new Date(Date.now() - 1_000) } },
      );
    await api
      .post('/api/v1/media/uploads')
      .auth(signedIn.token, { type: 'bearer' })
      .send({
        purpose: 'source-document',
        length: 800,
        sha256: createHash('sha256').update('active-lease').digest('hex'),
      })
      .expect(413);
    await db
      .db()
      .collection<UploadRecord>('mediaUploads')
      .updateOne(
        { _id: first.uploadId },
        { $set: { leaseExpiresAt: new Date(Date.now() - 1_000) } },
      );
    await createUpload(signedIn.token, 800);
    const firstRecord = await db
      .db()
      .collection<UploadRecord>('mediaUploads')
      .findOne({ _id: first.uploadId });
    if (!firstRecord) throw new Error('Expected the first quota reservation.');
    const quota = await db
      .db()
      .collection<{ _id: string; reservedBytes: number }>('mediaQuotas')
      .findOne({ _id: firstRecord.accountId });
    assert.equal(quota?.reservedBytes, 800);
  });

  void it('should version, review, publish and hide materials transactionally', async () => {
    const author = await createEditor();
    const reviewer = await createEditor();
    const upload = await createUpload(author.token, 256, {
      alternativeText: 'Архивна снимка към материала.',
      rightsEvidence: 'Писмено разрешение за публично показване.',
    });
    const uploadClaim = await claimUpload(upload).expect(200);
    await completeUpload(upload, uploadClaim.body.attemptId).expect(204);

    const created = await api
      .post('/api/admin/v1/materials')
      .auth(author.token, { type: 'bearer' })
      .set('X-Correlation-ID', `material-create-${randomUUID()}`)
      .send({ type: 'Story', language: 'bg', title: 'Първа чернова' })
      .expect(201);
    const initial = created.body as MaterialResponse;
    assert.equal(initial.version, 1);
    assert.equal(initial.workingRevisionNumber, 1);
    assert.equal(initial.workingStatus, 'Draft');
    assert.equal(
      created.headers.location,
      `/api/admin/v1/materials/${initial.id}`,
    );

    await api
      .get(`/api/admin/v1/materials/${initial.id}`)
      .auth(reviewer.token, { type: 'bearer' })
      .expect(404);
    const missingPrecondition = await api
      .patch(`/api/admin/v1/materials/${initial.id}`)
      .auth(author.token, { type: 'bearer' })
      .send({ title: 'Промяна без версия' })
      .expect(428);
    assert.equal(missingPrecondition.body.code, 'precondition_required');

    const categoryId = randomUUID();
    const topicId = randomUUID();
    const sourceId = randomUUID();
    const update = {
      title: 'Завършена редакторска чернова',
      body: 'Историята на мястото, проверена по архивни източници.',
      categoryIds: [categoryId],
      topicIds: [topicId],
      sourceIds: [sourceId],
      mediaRefs: [{ mediaId: upload.uploadId, role: 'hero', order: 0 }],
      rights: {
        publicDisplayAllowed: true,
        statement: 'Правата за материала са проверени.',
      },
      changeSummary: 'Добавени източници, права и основна снимка.',
    };
    const updateCall = () =>
      api
        .patch(`/api/admin/v1/materials/${initial.id}`)
        .auth(author.token, { type: 'bearer' })
        .set('If-Match', created.headers.etag as string)
        .send(update);
    const competingUpdates = await Promise.all([updateCall(), updateCall()]);
    assert.deepEqual(
      competingUpdates.map((response) => response.status).sort(),
      [200, 412],
    );
    const updatedResponse = competingUpdates.find(
      (response) => response.status === 200,
    );
    if (!updatedResponse) throw new Error('Expected one successful update.');
    const updated = updatedResponse.body as MaterialResponse;
    assert.equal(updated.version, 2);
    assert.equal(updated.workingRevisionNumber, 2);

    const initialRevision = await api
      .get(`/api/admin/v1/materials/${initial.id}/revisions/1`)
      .auth(author.token, { type: 'bearer' })
      .expect(200);
    assert.equal(initialRevision.body.content.title, 'Първа чернова');
    const firstRevisionPage = await api
      .get(`/api/admin/v1/materials/${initial.id}/revisions`)
      .auth(author.token, { type: 'bearer' })
      .expect(200);
    assert.deepEqual(
      (firstRevisionPage.body.items as { revisionNumber: number }[]).map(
        (item) => item.revisionNumber,
      ),
      [2, 1],
    );

    const transition = (
      token: string,
      action: string,
      expectedVersion: number,
      reason?: string,
    ) =>
      api
        .post(`/api/admin/v1/materials/${initial.id}/transitions`)
        .auth(token, { type: 'bearer' })
        .set('X-Correlation-ID', `material-${action}-${randomUUID()}`)
        .send({ action, expectedVersion, ...(reason ? { reason } : {}) });

    const submitted = await transition(
      author.token,
      'SubmitForReview',
      updated.version,
    ).expect(200);
    assert.equal((submitted.body as MaterialResponse).version, 3);
    await api
      .get(`/api/admin/v1/materials/${initial.id}`)
      .auth(reviewer.token, { type: 'bearer' })
      .expect(200);
    const reviewerList = await api
      .get('/api/admin/v1/materials')
      .auth(reviewer.token, { type: 'bearer' })
      .expect(200);
    assert(
      (reviewerList.body.items as { id: string }[]).some(
        (item) => item.id === initial.id,
      ),
    );

    const reviewing = await transition(reviewer.token, 'StartReview', 3).expect(
      200,
    );
    assert.equal((reviewing.body as MaterialResponse).version, 4);

    const blocked = await transition(reviewer.token, 'Publish', 4).expect(422);
    assert.equal(blocked.body.code, 'publication_rights_missing');
    assert.equal(
      blocked.body.detail,
      `media_rights_missing:${upload.uploadId}`,
    );
    assert.equal(
      await db
        .db()
        .collection('auditEvents')
        .countDocuments({ targetId: initial.id }),
      4,
    );

    const uploads = db.db().collection<UploadRecord>('mediaUploads');
    await uploads.updateOne(
      { _id: upload.uploadId },
      { $set: { processingStatus: 'Ready', accessStatus: 'Active' } },
    );
    const publishedResponse = await transition(
      reviewer.token,
      'Publish',
      4,
    ).expect(200);
    const published = publishedResponse.body as MaterialResponse;
    assert.equal(published.status, 'Published');
    assert.equal(published.publishedRevisionNumber, 2);
    assert.equal(published.version, 5);

    const publicUrl = `/api/v1/materials/${published.slug}`;
    const publicMaterial = await api.get(publicUrl).expect(200);
    assert.equal(publicMaterial.body.revisionNumber, 2);
    assert.equal(publicMaterial.body.content.title, update.title);
    await uploads.updateOne(
      { _id: upload.uploadId },
      { $set: { accessStatus: 'Restricted' } },
    );
    await api.get(publicUrl).expect(404);
    await uploads.updateOne(
      { _id: upload.uploadId },
      { $set: { accessStatus: 'Active' } },
    );
    await api.get(publicUrl).expect(200);

    const workingResponse = await api
      .patch(`/api/admin/v1/materials/${initial.id}`)
      .auth(author.token, { type: 'bearer' })
      .set('If-Match', publishedResponse.headers.etag as string)
      .send({
        title: 'Нова непубликувана редакция',
        changeSummary: 'Подготвена следваща версия.',
      })
      .expect(200);
    const working = workingResponse.body as MaterialResponse;
    assert.equal(working.version, 6);
    assert.equal(working.workingRevisionNumber, 3);
    assert.equal(working.publishedRevisionNumber, 2);
    assert.equal(working.workingStatus, 'InReview');
    const stillPublished = await api.get(publicUrl).expect(200);
    assert.equal(stillPublished.body.content.title, update.title);

    const restoredResponse = await api
      .post(`/api/admin/v1/materials/${initial.id}/revision-restorations`)
      .auth(reviewer.token, { type: 'bearer' })
      .send({
        revisionNumber: 2,
        expectedVersion: 6,
        reason: 'Връщане към проверената публикувана редакция.',
      })
      .expect(200);
    const restored = restoredResponse.body as MaterialResponse;
    assert.equal(restored.version, 7);
    assert.equal(restored.workingRevisionNumber, 4);
    assert.equal(restored.draft.title, update.title);

    const archived = await transition(
      reviewer.token,
      'Archive',
      7,
      'Временно архивиране за редакционна проверка.',
    ).expect(200);
    assert.equal((archived.body as MaterialResponse).status, 'Archived');
    await api.get(publicUrl).expect(404);
    const unarchived = await transition(
      reviewer.token,
      'RestoreFromArchive',
      8,
      'Редакционната проверка приключи.',
    ).expect(200);
    assert.equal((unarchived.body as MaterialResponse).version, 9);
    assert.equal(
      (unarchived.body as MaterialResponse).workingRevisionNumber,
      5,
    );

    await transition(reviewer.token, 'Publish', 9).expect(200);
    await api.get(publicUrl).expect(200);
    const withdrawn = await transition(
      reviewer.token,
      'Withdraw',
      10,
      'Материалът се изтегля за допълнителна проверка.',
    ).expect(200);
    const finalMaterial = withdrawn.body as MaterialResponse;
    assert.equal(finalMaterial.status, 'Withdrawn');
    assert.equal(finalMaterial.version, 11);
    await api.get(publicUrl).expect(404);

    const finalRevisions = await api
      .get(`/api/admin/v1/materials/${initial.id}/revisions`)
      .auth(author.token, { type: 'bearer' })
      .expect(200);
    assert.deepEqual(
      (finalRevisions.body.items as { revisionNumber: number }[]).map(
        (item) => item.revisionNumber,
      ),
      [5, 4, 3, 2, 1],
    );
    const restoredRevision = await api
      .get(`/api/admin/v1/materials/${initial.id}/revisions/4`)
      .auth(author.token, { type: 'bearer' })
      .expect(200);
    assert.equal(restoredRevision.body.restoredFromRevisionNumber, 2);

    const auditCount = await db
      .db()
      .collection('auditEvents')
      .countDocuments({ targetId: initial.id });
    const outboxCount = await db
      .db()
      .collection('outboxEvents')
      .countDocuments({ aggregateId: initial.id });
    assert.equal(auditCount, finalMaterial.version);
    assert.equal(outboxCount, finalMaterial.version);
  });

  void it('should let users resume owned drafts, receive corrections and bookmark public materials', async () => {
    const email = `${randomUUID()}@example.test`;
    await register(email);
    await confirm(email);
    const author = await login(email);
    const reviewer = await createEditor();
    const root = '/api/v1/author/materials';
    const saved = '/api/v1/account/saved-materials';
    await api.get(root).expect(401);
    await api
      .get('/api/admin/v1/materials')
      .auth(author.token, { type: 'bearer' })
      .expect(403);
    const initial = await api
      .get(root)
      .auth(author.token, { type: 'bearer' })
      .expect(200);
    assert.deepEqual(initial.body.items, []);

    const created = await api
      .post(root)
      .auth(author.token, { type: 'bearer' })
      .send({ type: 'Story', language: 'bg', title: 'Спомен от фабриката' })
      .expect(201);
    const id = (created.body as MaterialResponse).id;
    const detail = `${root}/${id}`;
    const editorTransition = (
      action: string,
      expectedVersion: number,
      reason?: string,
    ) =>
      api
        .post(`/api/admin/v1/materials/${id}/transitions`)
        .auth(reviewer.token, { type: 'bearer' })
        .send({ action, expectedVersion, reason });
    const submit = (expectedVersion: number) =>
      api
        .post(`${detail}/submissions`)
        .auth(author.token, { type: 'bearer' })
        .send({ expectedVersion });
    await api.get(detail).auth(reviewer.token, { type: 'bearer' }).expect(404);
    await api
      .put(`${saved}/${id}`)
      .auth(author.token, { type: 'bearer' })
      .expect(404);
    const incomplete = await submit(1).expect(422);
    assert.equal(incomplete.body.code, 'submission_incomplete');

    const categoryId = randomUUID();
    const topicId = randomUUID();
    const sourceId = randomUUID();
    for (const item of [
      {
        kind: 'categories',
        _id: categoryId,
        name: 'Индустрия',
        status: 'Approved',
        isVisible: true,
      },
      {
        kind: 'categories',
        _id: randomUUID(),
        name: 'Индустрия - скрито',
        status: 'Hidden',
        isVisible: false,
      },
      { kind: 'topics', _id: topicId, name: 'Фабрики', status: 'Published' },
      {
        kind: 'sources',
        _id: sourceId,
        title: 'Личен архив',
        status: 'Active',
      },
    ]) {
      await db
        .db()
        .collection<typeof item & { slug: string }>(item.kind)
        .insertOne({ ...item, slug: `author-test-${item._id}` });
    }
    const available = await api
      .get('/api/v1/author/catalog-options/categoryIds')
      .query({ q: 'Индустрия' })
      .auth(author.token, { type: 'bearer' })
      .expect(200);
    assert.deepEqual(available.body.items, [
      { id: categoryId, label: 'Индустрия' },
    ]);

    const blocks = [
      {
        id: randomUUID(),
        type: 'Paragraph',
        text: 'Работихме заедно през 1978 година.',
      },
    ];
    const draft = {
      blocks,
      categoryIds: [categoryId],
      topicIds: [topicId],
      sourceIds: [sourceId],
      rights: {
        publicDisplayAllowed: true,
        statement: 'Авторски спомен с право за публично показване.',
      },
    };
    const update = () =>
      api
        .patch(detail)
        .auth(author.token, { type: 'bearer' })
        .set('If-Match', String(created.headers.etag))
        .send(draft);
    assert.deepEqual(
      (await Promise.all([update(), update()]))
        .map(({ status }) => status)
        .sort(),
      [200, 412],
    );
    const reloaded = await api
      .get(detail)
      .auth(author.token, { type: 'bearer' })
      .expect(200);
    assert.deepEqual(reloaded.body.draft.blocks, blocks);
    await submit(2).expect(200);
    const queue = await api
      .get('/api/admin/v1/materials')
      .query({ workingStatus: 'Submitted', type: 'Story' })
      .auth(reviewer.token, { type: 'bearer' })
      .expect(200);
    const queued = (
      queue.body.items as Array<{
        id: string;
        workingStatus: string;
        type: string;
      }>
    ).find((item) => item.id === id);
    assert.equal(queued?.workingStatus, 'Submitted');
    assert.equal(queued?.type, 'Story');
    const differentStage = await api
      .get('/api/admin/v1/materials')
      .query({ workingStatus: 'ChangesRequested' })
      .auth(reviewer.token, { type: 'bearer' })
      .expect(200);
    assert.equal(
      (differentStage.body.items as { id: string }[]).some(
        (item) => item.id === id,
      ),
      false,
    );
    await api.get(detail).auth(reviewer.token, { type: 'bearer' }).expect(404);
    await api
      .patch(detail)
      .auth(author.token, { type: 'bearer' })
      .set('If-Match', `"material-${id}-v3"`)
      .send(draft)
      .expect(409);
    await editorTransition('StartReview', 3).expect(200);
    await editorTransition(
      'RequestChanges',
      4,
      'Уточни името на фабриката.',
    ).expect(200);
    const feedback = await api
      .get(detail)
      .auth(author.token, { type: 'bearer' })
      .expect(200);
    assert.equal(feedback.body.workingStatus, 'ChangesRequested');
    assert.equal(feedback.body.correctionNote, 'Уточни името на фабриката.');
    const corrected = await api
      .patch(detail)
      .auth(author.token, { type: 'bearer' })
      .set('If-Match', String(feedback.headers.etag))
      .send({ title: 'Спомен от фабрика Берое' })
      .expect(200);
    const resubmitted = await submit(
      (corrected.body as MaterialResponse).version,
    ).expect(200);
    assert.equal(resubmitted.body.correctionNote, undefined);
    await editorTransition('StartReview', 7).expect(200);
    await editorTransition('Publish', 8).expect(200);
    const publicMaterial = await api
      .get(`/api/v1/materials/${created.body.slug}`)
      .expect(200);
    assert.deepEqual(publicMaterial.body.content.blocks, blocks);

    const bookmark = () =>
      api
        .put(`${saved}/${id}`)
        .auth(author.token, { type: 'bearer' })
        .expect(204);
    await Promise.all([bookmark(), bookmark()]);
    const bookmarks = await api
      .get(saved)
      .auth(author.token, { type: 'bearer' })
      .expect(200);
    assert.equal(bookmarks.body.items.length, 1);
    assert.equal(bookmarks.body.items[0].title, 'Спомен от фабрика Берое');
    const otherBookmarks = await api
      .get(saved)
      .auth(reviewer.token, { type: 'bearer' })
      .expect(200);
    assert.deepEqual(otherBookmarks.body.items, []);
    await editorTransition(
      'Withdraw',
      9,
      'Допълнителна редакционна проверка.',
    ).expect(200);
    assert.deepEqual(
      (await api.get(saved).auth(author.token, { type: 'bearer' }).expect(200))
        .body.items,
      [],
    );
    await api
      .delete(`${saved}/${id}`)
      .auth(author.token, { type: 'bearer' })
      .expect(204);
    assert.equal(
      await db
        .db()
        .collection('savedMaterials')
        .countDocuments({ materialId: id }),
      0,
    );
  });

  void it('should show live dashboard counts by role and protect audit journal reads', async () => {
    const admin = await createAdministrator();
    const editor = await createEditor();
    const database = db.db();
    const dashboard = '/api/admin/v1/dashboard';
    const journal = '/api/admin/v1/audit-events';
    const getAdmin = (path: string) =>
      api.get(path).auth(admin.token, { type: 'bearer' });
    await api.get(dashboard).expect(401);
    await api.get(journal).expect(401);
    await api.get(journal).auth(editor.token, { type: 'bearer' }).expect(403);

    const editorResponse = await api
      .get(dashboard)
      .auth(editor.token, { type: 'bearer' })
      .expect(200);
    assert(!('administrative' in editorResponse.body));
    assert.equal(
      editorResponse.body.submittedMaterials,
      await database
        .collection('materials')
        .countDocuments({ workingStatus: 'Submitted' }),
    );
    assert.equal(
      editorResponse.body.openModerationCases,
      await database
        .collection('moderationCases')
        .countDocuments({ status: 'Open' }),
    );
    assert.equal(
      editorResponse.body.restrictedMedia,
      await database
        .collection('mediaUploads')
        .countDocuments({ accessStatus: 'Restricted' }),
    );

    const sessions = database.collection('sessions');
    await sessions.updateOne(
      { accountId: admin.id },
      { $unset: { mfaVerifiedAt: 1 } },
    );
    assert.equal(
      (await getAdmin(journal).expect(403)).body.code,
      'mfa_required',
    );
    assert.equal(
      (await getAdmin(dashboard).expect(403)).body.code,
      'mfa_required',
    );
    await sessions.updateOne(
      { accountId: admin.id },
      { $set: { mfaVerifiedAt: new Date() } },
    );

    const eventIds = [uuidv7(), uuidv7()];
    const targetId = uuidv7();
    const operationId = uuidv7();
    const occurredAt = new Date();
    const events = database.collection<{ _id: string; [key: string]: unknown }>(
      'auditEvents',
    );
    const fromUtc = occurredAt.toISOString();
    const toUtc = new Date(occurredAt.getTime() + 1_000).toISOString();
    const contact = randomUUID() + '@example.test';
    const privateValue = randomUUID();
    await events.insertMany(
      eventIds.map((_id) => ({
        _id,
        occurredAt,
        action: 'AccountRoleChanged',
        actorId: admin.id,
        actorRole: 'Administrator',
        targetId,
        targetType: 'Account',
        targetVersion: 1,
        outcome: 'Succeeded',
        reason: 'Подкрепено от ' + contact,
        correlationId: 'audit-source-check',
        metadata: {
          operationId,
          role: 'Editor',
          previousRole: 'User',
          email: contact,
          nested: { privateValue },
        },
      })),
    );

    try {
      const dashboardResponse = await getAdmin(dashboard).expect(200);
      assert(dashboardResponse.body.administrative.auditEventsLast24Hours >= 2);
      assert.equal(
        typeof dashboardResponse.body.administrative.bannedAccounts,
        'number',
      );
      assert.equal(
        typeof dashboardResponse.body.administrative
          .failedPasswordResetsLast24Hours,
        'number',
      );
      const filters = {
        actorId: admin.id,
        targetId,
        action: 'AccountRoleChanged',
        targetType: 'Account',
        outcome: 'Succeeded',
        fromUtc,
        toUtc,
        limit: 1,
      };
      const first = await getAdmin(journal)
        .query(filters)
        .set('X-Correlation-ID', 'audit-list-check')
        .expect(200);
      assert.deepEqual(first.body.items, [
        {
          action: 'AccountRoleChanged',
          actorId: admin.id,
          actorRole: 'Administrator',
          id: eventIds[1],
          occurredAtUtc: fromUtc,
          outcome: 'Succeeded',
          targetId,
          targetType: 'Account',
        },
      ]);
      const cursor = first.body.nextCursor as string;
      assert.equal(typeof cursor, 'string');
      const second = await getAdmin(journal)
        .query({ ...filters, cursor })
        .expect(200);
      assert.equal(second.body.items[0].id, eventIds[0]);
      assert.equal(second.body.nextCursor, undefined);
      await getAdmin(journal)
        .query({ ...filters, cursor: cursor + 'a' })
        .expect(400);
      await getAdmin(journal)
        .query({ ...filters, outcome: 'Failed', cursor })
        .expect(400);
      await getAdmin(journal)
        .query({ ...filters, toUtc: fromUtc })
        .expect(400);
      await getAdmin(journal)
        .query({ fromUtc: '2026-02-31T00:00:00Z' })
        .expect(422);

      const path = journal + '/' + eventIds[0];
      await api.get(path).auth(editor.token, { type: 'bearer' }).expect(403);
      await getAdmin(journal + '/' + uuidv7()).expect(404);
      const detail = await getAdmin(path)
        .set('X-Correlation-ID', 'audit-detail-check')
        .expect('Cache-Control', 'private, no-store')
        .expect(200);
      assert.equal(detail.body.traceId, 'audit-source-check');
      assert.equal(detail.body.operationId, operationId);
      assert.equal(detail.body.reason, 'Подкрепено от [имейл]');
      assert.deepEqual(detail.body.changeSummary, [
        { field: 'previousRole', value: 'User' },
        { field: 'role', value: 'Editor' },
      ]);
      assert(!detail.text.includes(contact));
      assert(!detail.text.includes(privateValue));
      assert(!('metadata' in detail.body));
      const reads = database.collection('auditAccessEvents');
      assert(
        await reads.findOne({
          actorId: admin.id,
          action: 'Listed',
          traceId: 'audit-list-check',
        }),
      );
      assert(
        await reads.findOne({
          actorId: admin.id,
          action: 'Viewed',
          auditEventId: eventIds[0],
          traceId: 'audit-detail-check',
        }),
      );
      assert.equal(await reads.countDocuments({ actorId: editor.id }), 0);
    } finally {
      await events.deleteMany({ _id: { $in: eventIds } });
    }
  });

  void it('should edit public site settings with MFA, a strong ETag and one audit for competing writes', async () => {
    const admin = await createAdministrator();
    const editor = await createEditor();
    const settingsPath = '/api/admin/v1/site-settings';
    const publicPath = '/api/v1/site-settings';
    const adminGet = () =>
      api.get(settingsPath).auth(admin.token, { type: 'bearer' });
    const adminPut = (body: Record<string, unknown>, etag?: string) => {
      const request = api
        .put(settingsPath)
        .auth(admin.token, { type: 'bearer' });
      if (etag) request.set('If-Match', etag);
      return request.send(body);
    };
    const publicDefaults = await api.get(publicPath).expect(200);
    assert.equal(publicDefaults.body.siteName, 'България, която изгубихме');
    assert.deepEqual(publicDefaults.body.banners, []);
    assert.equal(publicDefaults.body.version, undefined);

    const initial = await adminGet().expect(200);
    const etag = initial.headers.etag as string;
    const body = {
      siteName: 'Обновен обществен архив',
      supportContact: 'archive@example.test',
      footerLinks: [{ label: 'Начало', url: '/' }],
      socialLinks: [
        { platform: 'YouTube', url: 'https://www.youtube.com/@archive' },
      ],
      banners: [
        {
          text: 'Изложба на архива',
          enabled: true,
          link: { label: 'Начало', url: '/' },
        },
        { text: 'Скрито съобщение', enabled: false },
      ],
      featuredMaterialIds: [] as string[],
      reason: 'Обновено е публичното представяне.',
    };

    await api.get(settingsPath).expect(401);
    await api
      .get(settingsPath)
      .auth(editor.token, { type: 'bearer' })
      .expect(403);
    await api
      .put(settingsPath)
      .auth(editor.token, { type: 'bearer' })
      .set('If-Match', etag)
      .send(body)
      .expect(403);
    const sessions = db.db().collection('sessions');
    await sessions.updateOne(
      { accountId: admin.id },
      { $unset: { mfaVerifiedAt: 1 } },
    );
    assert.equal(
      (await adminPut(body, etag).expect(403)).body.code,
      'mfa_required',
    );
    await sessions.updateOne(
      { accountId: admin.id },
      { $set: { mfaVerifiedAt: new Date() } },
    );
    await adminPut(body).expect(428);
    await adminPut(body, '*').expect(412);
    const invalidLink = await adminPut(
      {
        ...body,
        footerLinks: [{ label: 'Връзка', url: '//elsewhere.example' }],
      },
      etag,
    ).expect(422);
    assert.equal(invalidLink.body.code, 'site_link_invalid');
    await adminPut(
      { ...body, footerLinks: [[{ label: 'Връзка', url: '/' }]] },
      etag,
    ).expect(422);
    const invalidSocial = await adminPut(
      {
        ...body,
        socialLinks: [
          {
            platform: 'YouTube',
            url: 'https://youtube.com.elsewhere.example/@archive',
          },
        ],
      },
      etag,
    ).expect(422);
    assert.equal(invalidSocial.body.code, 'site_social_link_invalid');
    const unavailable = await adminPut(
      { ...body, featuredMaterialIds: [uuidv7()] },
      etag,
    ).expect(422);
    assert.equal(unavailable.body.code, 'featured_material_unavailable');

    const materialCall = (method: 'post' | 'patch', path: string) =>
      api[method]('/api/admin/v1/materials' + path).auth(editor.token, {
        type: 'bearer',
      });
    const material = await materialCall('post', '')
      .send({ type: 'Story', language: 'bg', title: 'Акцент от архива' })
      .expect(201);
    const identity = material.body as MaterialResponse;
    await materialCall('patch', '/' + identity.id)
      .set('If-Match', material.headers.etag as string)
      .send({
        body: 'Запис за публичния архив.',
        categoryIds: [randomUUID()],
        topicIds: [randomUUID()],
        sourceIds: [randomUUID()],
        rights: {
          publicDisplayAllowed: true,
          statement: 'Правата са проверени.',
        },
        changeSummary: 'Проверени данни и права.',
      })
      .expect(200);
    const transition = (
      action: string,
      expectedVersion: number,
      reason?: string,
    ) =>
      materialCall('post', '/' + identity.id + '/transitions').send({
        action,
        expectedVersion,
        ...(reason ? { reason } : {}),
      });
    await transition('SubmitForReview', 2).expect(200);
    await transition('StartReview', 3).expect(200);
    await transition('Publish', 4).expect(200);

    body.featuredMaterialIds = [identity.id];
    const requests = await Promise.all([
      adminPut({ ...body, version: 9999 }, etag).set(
        'X-Correlation-ID',
        'site-settings-write-a',
      ),
      adminPut({ ...body, version: 9999 }, etag).set(
        'X-Correlation-ID',
        'site-settings-write-b',
      ),
    ]);
    assert.deepEqual(
      requests.map((response) => response.status).sort(),
      [200, 412],
    );
    const [updated] = requests.filter((response) => response.status === 200);
    const nextEtag = updated.headers.etag as string;
    assert.notEqual(nextEtag, etag);
    assert.equal(updated.body.version, Number(initial.body.version) + 1);
    await adminPut(body, nextEtag).expect(200).expect('ETag', nextEtag);

    const publicSettings = await api.get(publicPath).expect(200);
    assert.equal(publicSettings.body.siteName, body.siteName);
    assert.equal(publicSettings.body.supportContact, body.supportContact);
    assert.deepEqual(publicSettings.body.banners, [body.banners[0]]);
    assert.deepEqual(publicSettings.body.featuredMaterials, [
      { id: identity.id, title: 'Акцент от архива', slug: identity.slug },
    ]);
    assert.equal(publicSettings.body.updatedAtUtc, undefined);
    assert.equal(publicSettings.body.reason, undefined);

    await transition(
      'Withdraw',
      5,
      'Материалът се оттегля за редакция.',
    ).expect(200);
    const withdrawn = await api.get(publicPath).expect(200);
    assert.deepEqual(withdrawn.body.featuredMaterials, []);
    assert.deepEqual((await adminGet().expect(200)).body.featuredMaterialIds, [
      identity.id,
    ]);

    const auditLog = await api
      .get('/api/admin/v1/audit-events')
      .auth(admin.token, { type: 'bearer' })
      .query({ targetType: 'SiteSettings' })
      .expect(200);
    assert.equal(auditLog.body.items.length, 1);
    const audit = auditLog.body.items[0] as {
      id: string;
      actorId: string;
      action: string;
    };
    assert.equal(audit.actorId, admin.id);
    assert.equal(audit.action, 'SiteSettingsUpdated');
    const auditDetail = await api
      .get('/api/admin/v1/audit-events/' + audit.id)
      .auth(admin.token, { type: 'bearer' })
      .expect(200);
    assert.equal(auditDetail.body.traceId, updated.headers['x-correlation-id']);
    assert.equal(auditDetail.body.reason, body.reason);
    assert.match(auditDetail.body.changeSummary[0].value as string, /siteName/);
    assert(!auditDetail.text.includes(body.supportContact));
  });

  void it('should scope gallery reads to editorial access, audit changes and revoke media grants', async () => {
    const owner = await createEditor();
    const viewer = await createEditor();
    const admin = await createAdministrator();
    const gallery = '/api/admin/v1/media-assets';
    const upload = await createUpload(owner.token, 256, {
      alternativeText: 'Градският архив през есента',
      rightsEvidence: 'Разрешение от носителя на правата.',
    });
    const id = upload.uploadId;
    const path = gallery + '/' + id;
    const claimed = await claimUpload(upload).expect(200);
    await completeUpload(upload, claimed.body.attemptId).expect(204);
    const uploads = db
      .db()
      .collection<{ _id: string; [key: string]: unknown }>('mediaUploads');
    await uploads.updateOne(
      { _id: id },
      {
        $set: {
          processingStatus: 'Ready',
          previewFileKey: createHash('sha256').update(id).digest('hex'),
          previewStorageLocationId: 'preview-fixture',
          previewLength: 256,
          previewContentType: 'image/png',
        },
      },
    );

    const get = (route: string, token = admin.token) =>
      api.get(route).auth(token, { type: 'bearer' });
    const preview = (token: string) =>
      api.post(path + '/preview-grants').auth(token, { type: 'bearer' });
    await api.get(gallery).expect(401);
    await get(path, viewer.token).expect(404);
    await preview(viewer.token).expect(404);
    const hidden = await get(gallery, viewer.token)
      .query({ q: id })
      .expect(200);
    assert.deepEqual(hidden.body.items, []);
    const owned = await get(gallery, owner.token)
      .query({
        q: 'архив през есента',
        type: 'Image',
        rightsStatus: 'Recorded',
      })
      .expect(200);
    assert.equal(owned.body.items[0].id, id);
    assert.equal(owned.body.items[0].rightsEvidence, undefined);

    const materialCall = (method: 'post' | 'patch', suffix: string) =>
      api[method]('/api/admin/v1/materials' + suffix).auth(owner.token, {
        type: 'bearer',
      });
    const created = await materialCall('post', '')
      .send({ type: 'Story', language: 'bg', title: 'Градски архив' })
      .expect(201);
    const material = created.body as MaterialResponse;
    await materialCall('patch', '/' + material.id)
      .set('If-Match', created.headers.etag as string)
      .send({
        body: 'Архивен преглед на града.',
        categoryIds: [randomUUID()],
        topicIds: [randomUUID()],
        sourceIds: [randomUUID()],
        rights: {
          publicDisplayAllowed: true,
          statement: 'Правата са потвърдени.',
        },
        mediaRefs: [{ mediaId: id, role: 'hero', order: 0 }],
        changeSummary: 'Добавена е архивната снимка.',
      })
      .expect(200);
    await get(path, viewer.token).expect(404);
    const transition = (action: string, expectedVersion: number) =>
      materialCall('post', '/' + material.id + '/transitions').send({
        action,
        expectedVersion,
      });
    await transition('SubmitForReview', 2).expect(200);
    await transition('StartReview', 3).expect(200);
    await transition('Publish', 4).expect(200);
    const published = '/api/v1/materials/' + material.slug;
    await api.get(published).expect(200);

    const visible = await get(path, viewer.token).expect(200);
    assert.equal(visible.body.canEdit, false);
    assert.equal(visible.body.restrictionAction, undefined);
    assert.equal(visible.body.fileKey, undefined);
    assert.equal(visible.body.accountId, undefined);
    assert.equal(visible.body.sha256, undefined);
    const scoped = await get(gallery, viewer.token)
      .query({ q: id })
      .expect(200);
    assert.deepEqual(
      scoped.body.items.map((item: { id: string }) => item.id),
      [id],
    );
    const usages = await get(path + '/usages', viewer.token).expect(200);
    assert.deepEqual(usages.body, {
      items: [
        { materialId: material.id, title: 'Градски архив', revisionNumber: 2 },
      ],
      total: 1,
    });
    const viewerPreview = await preview(viewer.token).expect(201);
    const galleryGrant = viewerPreview.body.grant as string;
    sensitiveSamples.push(galleryGrant);
    await authorizeRead(id, 'preview', galleryGrant).expect(200);
    await authorizeRead(id, 'original', galleryGrant).expect(403);

    const detail = await get(path).expect(200);
    const etag = detail.headers.etag as string;
    const patch = (token: string, tag: string) =>
      api
        .patch(path)
        .auth(token, { type: 'bearer' })
        .set('If-Match', tag)
        .send({
          creditLine: 'Градски фотоархив',
          reason: 'Уточнен е кредитът.',
        });
    await patch(viewer.token, visible.headers.etag as string).expect(403);
    const edited = await patch(admin.token, etag).expect(200);
    assert.equal(edited.body.creditLine, 'Градски фотоархив');
    await patch(admin.token, etag).expect(412);
    await authorizeRead(id, 'preview', galleryGrant).expect(403);

    const adminPreview = await preview(admin.token).expect(201);
    const adminGrant = adminPreview.body.grant as string;
    sensitiveSamples.push(adminGrant);
    await authorizeRead(id, 'preview', adminGrant).expect(200);
    const sessions = db.db().collection('sessions');
    await sessions.updateOne(
      { accountId: admin.id },
      { $unset: { mfaVerifiedAt: 1 } },
    );
    assert.equal(
      (await authorizeRead(id, 'preview', adminGrant).expect(403)).body.code,
      'mfa_required',
    );
    await sessions.updateOne(
      { accountId: admin.id },
      { $set: { mfaVerifiedAt: new Date() } },
    );

    const ownerGrant = await createReadGrant(owner.token, id, 'original');
    const key = randomUUID();
    const command = {
      action: 'Restrict',
      expectedVersion: edited.body.version,
      reason: 'Проверка на правата.',
    };
    const change = (
      token: string,
      idempotencyKey: string,
      body: Record<string, unknown>,
    ) =>
      api
        .post(path + '/access-restrictions')
        .auth(token, { type: 'bearer' })
        .set('Idempotency-Key', idempotencyKey)
        .set('X-Correlation-ID', 'media-restriction-check')
        .send(body);
    await change(owner.token, key, command).expect(403);
    const responses = await Promise.all([
      change(admin.token, key, command).expect(200),
      change(admin.token, key, command).expect(200),
    ]);
    assert.deepEqual(responses[0].body, responses[1].body);
    assert.equal(responses[0].body.accessStatus, 'Restricted');
    assert.equal(responses[0].body.previewAvailable, false);
    await change(admin.token, key, {
      ...command,
      reason: 'Различна причина.',
    }).expect(409);
    await authorizeRead(id, 'preview', adminGrant).expect(403);
    await authorizeRead(id, 'original', ownerGrant.grant).expect(403);
    await preview(admin.token).expect(403);
    await api.get(published).expect(404);
    const lifted = await change(admin.token, randomUUID(), {
      action: 'LiftRestriction',
      expectedVersion: responses[0].body.version,
      reason: 'Правата са потвърдени.',
    }).expect(200);
    assert.equal(lifted.body.accessStatus, 'Active');
    await api.get(published).expect(200);
    await authorizeRead(id, 'original', ownerGrant.grant).expect(403);
    const events = await get('/api/admin/v1/audit-events')
      .query({ targetId: id, targetType: 'Media' })
      .expect(200);
    assert.equal(events.body.items.length, 3);
    const restriction = events.body.items.find(
      (event: { action: string }) => event.action === 'MediaAccessRestricted',
    ) as { id: string };
    const audit = await get(
      '/api/admin/v1/audit-events/' + restriction.id,
    ).expect(200);
    assert.equal(audit.body.traceId, 'media-restriction-check');
    assert.equal(audit.body.reason, 'Проверка на правата.');
    assert.equal(audit.body.changeSummary[1].value, 'Restricted');
  });

  void it('should restrict the account directory and mask verified contact details', async () => {
    const admin = await createAdministrator();
    const editor = await createEditor();
    const another = await createEditor();
    const root = '/api/admin/v1/users';
    await api.get(root).expect(401);
    await api.get(root).auth(editor.token, { type: 'bearer' }).expect(403);
    await api
      .get(root + '/' + editor.id)
      .auth(editor.token, { type: 'bearer' })
      .expect(403);

    const sessions = db.db().collection('sessions');
    await sessions.updateOne(
      { accountId: admin.id },
      { $unset: { mfaVerifiedAt: 1 } },
    );
    const denied = await api
      .get(root)
      .query({ q: editor.email })
      .auth(admin.token, { type: 'bearer' })
      .expect(403);
    assert.equal(denied.body.code, 'mfa_required');
    assert.equal(denied.body.instance, root);
    assert(!denied.text.includes(editor.email));
    await sessions.updateOne(
      { accountId: admin.id },
      { $set: { mfaVerifiedAt: new Date() } },
    );

    const find = (query: Record<string, string | number>) =>
      api.get(root).query(query).auth(admin.token, { type: 'bearer' });
    const exact = await find({
      q: editor.email.toUpperCase(),
      role: 'Editor',
      status: 'Active',
    }).expect(200);
    assert.equal(exact.body.items.length, 1);
    assert.equal(exact.body.items[0].id, editor.id);
    assert(!exact.text.includes(editor.email));
    await find({ q: 'example.test' }).expect(400);

    const detail = await api
      .get(root + '/' + editor.id)
      .auth(admin.token, { type: 'bearer' })
      .expect(200);
    assert.equal(detail.body.mfaEnabled, false);
    assert.equal(
      detail.body.verifiedContactMasked,
      editor.email[0] + '***@e***',
    );
    assert.match(String(detail.headers['cache-control']), /no-store/);
    assert.doesNotMatch(
      detail.text,
      /passwordHash|mfaSecret|authVersion|example\.test/,
    );

    const filters = { role: 'Editor', status: 'Active', limit: 1 };
    const page = await find(filters).expect(200);
    const cursor = page.body.nextCursor as string;
    assert(cursor);
    const next = await find({ ...filters, cursor }).expect(200);
    assert.equal(page.body.items[0].id, another.id);
    assert.equal(next.body.items[0].id, editor.id);
    await find({ ...filters, status: 'Pending', cursor }).expect(400);
    const altered = cursor.slice(0, -1) + (cursor.endsWith('A') ? 'B' : 'A');
    await find({ ...filters, cursor: altered }).expect(400);
  });

  void it('should manage profiles and sanctions, revoke live sessions and send a traceable password reset', async () => {
    const admin = await createAdministrator();
    const otherAdmin = await createAdministrator();
    const email = randomUUID() + '@example.test';
    await register(email);
    await confirm(email);
    const first = await login(email);
    const me = await api
      .get(auth + '/me')
      .auth(first.token, { type: 'bearer' })
      .expect(200);
    const id = me.body.id as string;
    const root = '/api/admin/v1/users';
    const profile = root + '/' + id;
    const get = (url = profile, token = admin.token) =>
      api.get(url).auth(token, { type: 'bearer' });
    const post = (suffix: string, data: object, key = randomUUID()) =>
      api
        .post(profile + suffix)
        .auth(admin.token, { type: 'bearer' })
        .set('Idempotency-Key', key)
        .send(data);
    const rejects = async (tokens: Tokens) => {
      await get(auth + '/me', tokens.token).expect(401);
      await api
        .post(auth + '/refresh')
        .auth(tokens.refreshToken, { type: 'bearer' })
        .expect(401);
    };
    const version = async () =>
      (await get().expect(200)).body.version as number;
    const initial = await get().expect(200);
    const patch = () =>
      api.patch(profile).auth(admin.token, { type: 'bearer' }).send({
        displayName: 'Архивен редактор',
        bio: 'Поддържа архивни материали.',
      });
    await patch().expect(428);
    const edited = await patch()
      .set('If-Match', String(initial.headers.etag))
      .expect(200);
    assert.equal(edited.body.version, 2);
    assert.equal(edited.body.displayName, 'Архивен редактор');
    assert.equal(edited.body.bio, 'Поддържа архивни материали.');
    const own = await get(auth + '/me', first.token).expect(200);
    assert.equal(own.body.displayName, edited.body.displayName);
    assert.equal(own.body.bio, edited.body.bio);
    await patch().set('If-Match', String(initial.headers.etag)).expect(412);

    await post('/role-changes', {
      role: 'Editor',
      expectedVersion: 2,
      reason: '   ',
    }).expect(422);
    const role = {
      role: 'Editor',
      expectedVersion: 2,
      reason: 'Одобрена редакторска роля.',
    };
    await api
      .post(profile + '/role-changes')
      .auth(admin.token, { type: 'bearer' })
      .send(role)
      .expect(400);
    const roleKey = randomUUID();
    const changed = await post('/role-changes', role, roleKey).expect(200);
    assert.equal(changed.body.role, 'Editor');
    assert.deepEqual(
      (await post('/role-changes', role, roleKey).expect(200)).body,
      changed.body,
    );
    assert.equal(
      (
        await post(
          '/role-changes',
          { ...role, reason: 'Друга причина.' },
          roleKey,
        ).expect(409)
      ).body.code,
      'idempotency_key_reused',
    );
    await rejects(first);
    const editor = await login(email);
    const timedVersion = await version();
    const reason = 'Временна санкция при проверка.';
    await post('/sanctions', {
      expectedVersion: timedVersion,
      reason,
      expiresAtUtc: '2020-01-01T00:00:00Z',
    }).expect(422);
    await post('/sanctions', { expectedVersion: timedVersion, reason }).expect(
      422,
    );
    const timed = {
      expectedVersion: timedVersion,
      reason,
      expiresAtUtc: new Date(Date.now() + 60_000).toISOString(),
    };
    const banKey = randomUUID();
    const [issued, repeated] = await Promise.all([
      post('/sanctions', timed, banKey).expect(201),
      post('/sanctions', timed, banKey).expect(201),
    ]);
    assert.deepEqual(issued.body, repeated.body);
    const sanctionId = issued.body.id as string;
    assert.equal(issued.headers.location, profile + '/sanctions/' + sanctionId);
    assert.equal((await get().expect(200)).body.status, 'Banned');
    const filtered = await api
      .get(root)
      .query({ status: 'Banned', q: email })
      .auth(admin.token, { type: 'bearer' })
      .expect(200);
    assert.equal(filtered.body.items[0].id, id);
    await rejects(editor);
    await api
      .post(auth + '/email/login')
      .set('X-Forwarded-For', authClientIp(email))
      .send({ email, password: details.password })
      .expect(422);

    // Move just this synthetic fixture past its expiry without waiting on CI clocks.
    const past = new Date('2020-01-01T00:00:00Z');
    await db
      .db()
      .collection<{ _id: string }>('users')
      .updateOne({ _id: id }, { $set: { 'activeSanction.expiresAt': past } });
    await db
      .db()
      .collection<{ _id: string }>('accountSanctions')
      .updateOne({ _id: sanctionId }, { $set: { expiresAt: past } });
    const afterExpiry = await get().expect(200);
    assert.equal(afterExpiry.body.status, 'Active');
    assert.equal(afterExpiry.body.activeSanction, undefined);
    await rejects(editor);
    const afterExpiryTokens = await login(email);
    const permanent = await post('/sanctions', {
      expectedVersion: afterExpiry.body.version as number,
      reason: 'Наложена е безсрочна санкция.',
      expiresAtUtc: null,
    }).expect(201);
    assert.equal(permanent.body.expiresAtUtc, null);
    await rejects(afterExpiryTokens);
    const revokeUrl = '/sanctions/' + (permanent.body.id as string) + '/revoke';
    const revokedBan = await post(revokeUrl, {
      expectedVersion: await version(),
      reason: 'Проверката приключи.',
    }).expect(200);
    assert.equal(revokedBan.body.status, 'Active');
    const history = await api
      .get(profile + '/sanctions')
      .query({ limit: 1 })
      .auth(admin.token, { type: 'bearer' })
      .expect(200);
    assert.equal(history.body.items[0].revokeReason, 'Проверката приключи.');
    const historyCursor = history.body.nextCursor as string;
    assert(historyCursor);
    const older = await api
      .get(profile + '/sanctions')
      .query({ cursor: historyCursor })
      .auth(admin.token, { type: 'bearer' })
      .expect(200);
    assert.equal(older.body.items[0].id, sanctionId);
    await get(root + '/' + admin.id + '/sanctions/' + sanctionId).expect(404);

    const active = await login(email);
    const revoke = {
      expectedVersion: await version(),
      reason: 'Принудителен край на сесиите.',
    };
    await post('/session-revocations', revoke).expect(204);
    await rejects(active);
    await post('/session-revocations', revoke).expect(409);

    const reset = {
      expectedVersion: await version(),
      reason: 'Заявено възстановяване на достъп.',
    };
    const resetKey = randomUUID();
    const response = await post('/password-reset-requests', reset, resetKey)
      .set('X-Correlation-ID', 'admin-reset-acceptance')
      .expect(202);
    const operationId = response.body.operationId as string;
    const operationUrl = response.body.statusUrl as string;
    assert.equal(response.headers.location, operationUrl);
    assert.deepEqual(
      (await post('/password-reset-requests', reset, resetKey).expect(202))
        .body,
      response.body,
    );
    const operation = await get(operationUrl).expect(200);
    assert.equal(operation.body.status, 'Succeeded');
    assert.equal(operation.body.traceId, 'admin-reset-acceptance');
    await get(operationUrl, otherAdmin.token).expect(404);
    const hash = await mailHash(email, '/password-change');
    const audit = db.db().collection('auditEvents');
    const events = await audit
      .find({ targetId: id, 'metadata.operationId': operationId })
      .toArray();
    assert.deepEqual(events.map((event) => event.action).sort(), [
      'AccountPasswordResetDispatched',
      'AccountPasswordResetRequested',
    ]);
    const outbox = await db
      .db()
      .collection('outboxEvents')
      .findOne({ 'payload.operationId': operationId });
    assert(outbox);
    const persisted = JSON.stringify([
      events,
      outbox,
      response.body,
      operation.body,
    ]);
    assert(!persisted.includes(hash));
    assert(!persisted.includes(email));
    assert.equal(
      await audit.countDocuments({
        targetId: id,
        action: 'AccountSanctionIssued',
      }),
      2,
    );
    const password = randomCredential('ManagedReset');
    for (let attempt = 0; attempt < 2; attempt++) {
      await post('/password-reset-requests', {
        ...reset,
        expectedVersion: await version(),
      }).expect(202);
    }
    const limited = await post('/password-reset-requests', {
      ...reset,
      expectedVersion: await version(),
    }).expect(429);
    assert.equal(limited.body.code, 'password_reset_rate_limited');
    assert.equal(limited.headers['retry-after'], '3600');
    sensitiveSamples.push(password, hash);
    await api
      .post(auth + '/reset/password')
      .send({ hash, password })
      .expect(204);
    await api
      .post(auth + '/reset/password')
      .send({ hash, password })
      .expect(422);
    await login(email, password);
  });

  void it('should switch checked SFTP profiles atomically and preserve already reserved uploads', async () => {
    const admin = await createAdministrator();
    const editor = await createEditor();
    const root = '/api/admin/v1/storage-locations';
    const profiles = '/api/admin/v1/storage-connection-profiles';
    const get = (path: string, token = admin.token) =>
      api.get(path).auth(token, { type: 'bearer' });
    const post = (path: string, body: object, key: string = randomUUID()) =>
      api
        .post(path)
        .auth(admin.token, { type: 'bearer' })
        .set('Idempotency-Key', key)
        .send(body);
    const draft = async (profileId: string) => {
      const result = await post(root, { label: profileId, profileId }).expect(
        201,
      );
      return result.body as {
        id: string;
        version: number;
        routingVersion: number;
      };
    };
    const detail = async (id: string) => {
      const response = await get(root + '/' + id).expect(200);
      return response.body as {
        id: string;
        version: number;
        routingVersion: number;
        status: string;
        profileId: string;
      };
    };
    const probe = (id: string, version: number, key?: string) =>
      post(
        root + '/' + id + '/connection-checks',
        { expectedVersion: version },
        key,
      );
    const activate = (
      location: Awaited<ReturnType<typeof detail>>,
      key?: string,
    ) =>
      post(
        root + '/' + location.id + '/transitions',
        {
          action: 'ActivateForNewWrites',
          expectedVersion: location.version,
          expectedRoutingVersion: location.routingVersion,
          reason: 'Проверка на маршрутизацията',
        },
        key,
      );

    await api.get(root).expect(401);
    await get(root, editor.token).expect(403);
    await get(profiles, editor.token).expect(403);
    const safeProfiles = await get(profiles).expect(200);
    assert.deepEqual(safeProfiles.body.items[0], {
      id: 'archive',
      label: 'archive',
    });
    assert.equal(safeProfiles.body.items.length, 5);
    const before = await get(root)
      .query({ status: 'ActiveForNewWrites' })
      .expect(200);
    assert.equal(before.body.items[0].profileId, 'archive');
    const legacyId = before.body.items[0].id as string;
    const originalUpload = await createUpload(editor.token);

    const missing = await post(root, {
      label: 'Непознато',
      profileId: 'unknown',
    }).expect(422);
    assert.equal(missing.body.code, 'storage_profile_unknown');
    const draftPayload = { label: 'Второ хранилище', profileId: 'secondary' };
    const createKey = randomUUID();
    const created = await post(root, draftPayload, createKey).expect(201);
    const secondary = await detail(created.body.id as string);
    assert.equal(created.headers.location, root + '/' + secondary.id);
    assert.equal(
      (await post(root, draftPayload, createKey).expect(201)).body.id,
      secondary.id,
    );
    await post(
      root,
      { ...draftPayload, label: 'Друг етикет' },
      createKey,
    ).expect(409);
    assert.equal(
      (await activate(secondary).expect(409)).body.code,
      'storage_not_ready',
    );

    const denied = await draft('denied');
    const deniedHealth = await probe(denied.id, denied.version).expect(200);
    assert.equal(deniedHealth.body.status, 'Denied');
    assert.equal(deniedHealth.body.capacityBytes, null);
    const offline = await draft('offline');
    assert.equal(
      (await probe(offline.id, offline.version).expect(200)).body.status,
      'Unavailable',
    );

    const checkKey = randomUUID();
    const result = await probe(
      secondary.id,
      secondary.version,
      checkKey,
    ).expect(200);
    assert.equal(result.body.status, 'Healthy');
    assert.deepEqual(
      (await probe(secondary.id, secondary.version, checkKey).expect(200)).body,
      result.body,
    );
    assert.equal(storageProbes.filter((id) => id === 'secondary').length, 1);

    const spare = await draft('spare');
    await probe(spare.id, spare.version).expect(200);
    const candidates = await Promise.all([
      detail(secondary.id),
      detail(spare.id),
    ]);
    const switchKeys = [randomUUID(), randomUUID()];
    const attempts = await Promise.all(
      candidates.map((candidate, index) =>
        activate(candidate, switchKeys[index]),
      ),
    );
    assert.deepEqual(attempts.map(({ status }) => status).sort(), [200, 409]);
    const winIndex = attempts.findIndex(({ status }) => status === 200);
    const winner = candidates[winIndex];
    assert.equal(attempts[1 - winIndex].body.code, 'routing_version_conflict');
    assert.deepEqual(
      (await activate(winner, switchKeys[winIndex]).expect(200)).body,
      attempts[winIndex].body,
    );
    assert.equal((await detail(legacyId)).status, 'ReadOnly');

    const newUpload = await createUpload(editor.token);
    const oldClaim = await claimUpload(originalUpload).expect(200);
    const newClaim = await claimUpload(newUpload).expect(200);
    assert.equal(oldClaim.body.object.storageLocationId, 'archive');
    assert.equal(newClaim.body.object.storageLocationId, winner.profileId);
    const events = await get('/api/admin/v1/audit-events')
      .query({ targetId: winner.id, action: 'StorageRoutingChanged' })
      .expect(200);
    assert.equal(events.body.items.length, 1);
    assert.equal(events.body.items[0].targetType, 'StorageLocation');
  });

  void it('should keep an active administrator under concurrent sanctions and role changes', async () => {
    const first = await createAdministrator();
    const second = await createAdministrator();
    const users = db
      .db()
      .collection<{ _id: string; role: string; status: string }>('users');
    const excluded = {
      role: 'Administrator',
      _id: { $nin: [first.id, second.id] },
    };
    const existing = await users.find(excluded).toArray();
    await users.updateMany(excluded, { $set: { status: 'Disabled' } });
    const root = '/api/admin/v1/users/';
    const run = (token: string, path: string, action: object) =>
      api
        .post(root + path)
        .auth(token, { type: 'bearer' })
        .set('Idempotency-Key', randomUUID())
        .send({
          ...action,
          expectedVersion: 1,
          reason: 'Проверка на администраторския достъп.',
        });
    try {
      const sessions = db.db().collection('sessions');
      await sessions.updateOne(
        { accountId: first.id },
        { $set: { mfaVerifiedAt: new Date('2020-01-01T00:00:00Z') } },
      );
      const expired = await run(first.token, second.id + '/sanctions', {
        expiresAtUtc: null,
      }).expect(403);
      assert.equal(expired.body.code, 'mfa_required');
      await sessions.updateOne(
        { accountId: first.id },
        { $set: { mfaVerifiedAt: new Date() } },
      );
      const [ban, demotion] = await Promise.all([
        run(first.token, second.id + '/sanctions', { expiresAtUtc: null }),
        run(second.token, first.id + '/role-changes', { role: 'User' }),
      ]);
      const firstWon = ban.status === 201;
      assert.equal(firstWon || demotion.status === 200, true);
      assert([401, 403].includes(firstWon ? demotion.status : ban.status));
      const stillActive = firstWon ? first : second;
      await api
        .get('/api/admin/v1/me')
        .auth(stillActive.token, { type: 'bearer' })
        .expect(200);
      for (const [suffix, command] of [
        ['/sanctions', { expiresAtUtc: null }],
        ['/role-changes', { role: 'User' }],
      ] as const) {
        const denied = await run(
          stillActive.token,
          stillActive.id + suffix,
          command,
        ).expect(409);
        assert.equal(denied.body.code, 'last_active_admin');
      }
    } finally {
      for (const account of existing) {
        await users.updateOne(
          { _id: account._id },
          { $set: { status: account.status } },
        );
      }
    }
  });

  void it('should deduplicate anonymous reports and require an authorized decision to restore a material', async () => {
    const editor = await createEditor();
    const admin = await createAdministrator();
    const readerEmail = randomUUID() + '@example.test';
    await register(readerEmail);
    await confirm(readerEmail);
    const reader = await login(readerEmail);
    const materials = '/api/admin/v1/materials';
    const queue = '/api/admin/v1/moderation-cases';
    const title = 'Снимка на училището';
    const created = await api
      .post(materials)
      .auth(editor.token, { type: 'bearer' })
      .send({ type: 'Story', language: 'bg', title })
      .expect(201);
    const { id, slug } = created.body as MaterialResponse;
    const materialUrl = materials + '/' + id;
    const publicUrl = '/api/v1/materials/' + slug;
    await api
      .patch(materialUrl)
      .auth(editor.token, { type: 'bearer' })
      .set('If-Match', String(created.headers.etag))
      .send({
        body: 'Спомен за първия учебен ден.',
        categoryIds: [randomUUID()],
        topicIds: [randomUUID()],
        sourceIds: [randomUUID()],
        rights: {
          publicDisplayAllowed: true,
          statement: 'Авторът разрешава публичното показване.',
        },
      })
      .expect(200);
    const transition = (
      action: string,
      expectedVersion: number,
      reason?: string,
    ) =>
      api
        .post(materialUrl + '/transitions')
        .auth(editor.token, { type: 'bearer' })
        .send({ action, expectedVersion, reason });
    await transition('SubmitForReview', 2).expect(200);
    await transition('StartReview', 3).expect(200);
    await transition('Publish', 4).expect(200);
    await api.get(publicUrl).expect(200);

    const report = {
      reasonCode: 'Copyright',
      description:
        'Източникът е описан от reporter@example.test и +359 888 123 456',
      evidenceUrl:
        'https://archive.example.org/photo?email=reporter@example.test#contact',
    };
    const reportKey = randomUUID();
    const submit = (body = report, key = reportKey) =>
      api
        .post(publicUrl + '/reports')
        .set('Idempotency-Key', key)
        .send(body);
    for (const result of await Promise.all([submit(), submit()])) {
      assert.equal(result.status, 202);
      assert.equal(result.text, '');
    }
    await submit({ ...report, description: 'Друго описание' }).expect(409);
    await api.get(queue).expect(401);
    await api.get(queue).auth(reader.token, { type: 'bearer' }).expect(403);
    const list = await api
      .get(queue)
      .auth(editor.token, { type: 'bearer' })
      .query({ caseType: 'Rights', status: 'Open', priority: 'High' })
      .expect(200);
    const entry = (
      list.body.items as { id: string; targetId: string; reportCount: number }[]
    ).find((item) => item.targetId === id);
    assert(entry);
    assert.equal(entry.reportCount, 1);
    const detail = queue + '/' + entry.id;
    const reports = await api
      .get(detail + '/reports')
      .auth(editor.token, { type: 'bearer' })
      .expect(200);
    assert.equal(reports.body.items.length, 1);
    assert.equal(
      reports.body.items[0].evidenceUrl,
      'https://archive.example.org/photo',
    );
    assert.equal(reports.body.items[0].revisionNumber, 2);
    assert.equal(
      reports.body.items[0].description,
      'Източникът е описан от [скрит имейл] и [скрит номер]',
    );
    assert.doesNotMatch(
      reports.text,
      /reporter@example|888 123 456|payloadHash|requestHash/,
    );
    const open = await api
      .get(detail)
      .auth(editor.token, { type: 'bearer' })
      .expect(200);
    assert.deepEqual(open.body.allowedDecisions, []);
    const take = () =>
      api
        .patch(detail)
        .auth(editor.token, { type: 'bearer' })
        .set('If-Match', String(open.headers.etag))
        .send({ priority: 'High' });
    const taken = await take().expect(200);
    assert.equal(taken.body.assigneeId, editor.id);
    await take().expect(412);

    const withdraw = {
      decision: 'WithdrawMaterial',
      reason: 'Липсва доказателство за разрешение.',
      expectedVersion: taken.body.version as number,
      targetExpectedVersion: taken.body.target.version as number,
    };
    const decide = (token: string, body: typeof withdraw, key = randomUUID()) =>
      api
        .post(detail + '/decisions')
        .auth(token, { type: 'bearer' })
        .set('Idempotency-Key', key)
        .send(body);
    await decide(editor.token, {
      ...withdraw,
      targetExpectedVersion: 4,
    }).expect(409);
    const withdrawKey = randomUUID();
    const withdrawn = await decide(editor.token, withdraw, withdrawKey).expect(
      200,
    );
    assert.equal(withdrawn.body.target.status, 'Withdrawn');
    assert.equal(withdrawn.body.target.publicVisibility, false);
    await api.get(publicUrl).expect(404);
    await submit().expect(202);
    await submit(report, randomUUID()).expect(404);
    assert.equal(
      (await transition('Publish', 6).expect(409)).body.code,
      'moderation_hold',
    );
    assert.equal(
      (await transition('Archive', 6, 'Архивна проверка.').expect(409)).body
        .code,
      'moderation_hold',
    );

    const restore = {
      decision: 'RestoreMaterial',
      reason: 'Проверено е разрешение за показване.',
      expectedVersion: withdrawn.body.version as number,
      targetExpectedVersion: withdrawn.body.target.version as number,
    };
    await decide(editor.token, restore).expect(403);
    const sessions = db.db().collection('sessions');
    await sessions.updateOne(
      { accountId: admin.id },
      { $unset: { mfaVerifiedAt: 1 } },
    );
    assert.equal(
      (await decide(admin.token, restore).expect(403)).body.code,
      'mfa_required',
    );
    await sessions.updateOne(
      { accountId: admin.id },
      { $set: { mfaVerifiedAt: new Date() } },
    );
    const restored = await decide(admin.token, restore).expect(200);
    assert.equal(restored.body.target.status, 'Published');
    assert.equal(restored.body.withdrawal.reason, withdraw.reason);
    const publicResult = await api.get(publicUrl).expect(200);
    assert.equal(publicResult.body.content.title, title);
    assert.equal(publicResult.body.revisionNumber, 2);
    assert.deepEqual(
      (await decide(editor.token, withdraw, withdrawKey).expect(200)).body,
      withdrawn.body,
    );
    await decide(
      editor.token,
      { ...withdraw, reason: 'Променена причина' },
      withdrawKey,
    ).expect(409);

    const audit = db.db().collection('auditEvents');
    assert.equal(
      await audit.countDocuments({
        targetId: entry.id,
        action: 'ModerationWithdrawMaterial',
      }),
      1,
    );
    assert.equal(
      await audit.countDocuments({
        targetId: id,
        action: 'MaterialModerationWithdrawn',
        'metadata.moderationCaseId': entry.id,
      }),
      1,
    );
    assert.equal(
      await audit.countDocuments({
        targetId: id,
        action: 'MaterialModerationRestored',
        actorId: admin.id,
      }),
      1,
    );
    const outbox = db.db().collection('outboxEvents');
    assert.equal(
      await outbox.countDocuments({
        aggregateId: id,
        'payload.moderationCaseId': entry.id,
      }),
      2,
    );
  });

  void it(
    'should govern catalog proposals, hierarchies and canonical merges',
    { timeout: 60_000 },
    async () => {
      const editor = await createEditor();
      const administrator = await createAdministrator();
      const ordinaryEmail = `${randomUUID()}@example.test`;
      await register(ordinaryEmail);
      await confirm(ordinaryEmail);
      const ordinary = await login(ordinaryEmail);

      const createCatalog = (
        kind: string,
        body: Record<string, unknown>,
        token = editor.token,
      ) =>
        api
          .post(`/api/admin/v1/catalog/${kind}`)
          .auth(token, { type: 'bearer' })
          .send(body);
      const transitionCatalog = (
        kind: string,
        id: string,
        action: string,
        expectedVersion: number,
        reason?: string,
      ) =>
        api
          .post(`/api/admin/v1/catalog/${kind}/${id}/transitions`)
          .auth(editor.token, { type: 'bearer' })
          .send({ action, expectedVersion, ...(reason ? { reason } : {}) });

      await createCatalog(
        'topics',
        { name: 'Забранена тема', slug: `forbidden-${randomUUID()}` },
        ordinary.token,
      ).expect(403);

      const sourceTopicResponse = await createCatalog('topics', {
        name: 'Стара индустриална България',
        slug: 'stara-industrialna-bulgaria',
        summary: 'Истории за предприятията преди прехода.',
      }).expect(201);
      const sourceTopic = sourceTopicResponse.body as CatalogResponse;
      assert.equal(sourceTopic.status, 'Draft');
      assert.equal(
        sourceTopicResponse.headers.etag,
        `"catalog-${sourceTopic.id}-v1"`,
      );
      const noEtag = await api
        .patch(`/api/admin/v1/catalog/topics/${sourceTopic.id}`)
        .auth(editor.token, { type: 'bearer' })
        .send({ summary: 'Промяна без версия.' })
        .expect(428);
      assert.equal(noEtag.body.code, 'precondition_required');
      await transitionCatalog('topics', sourceTopic.id, 'Propose', 1).expect(
        200,
      );
      await transitionCatalog('topics', sourceTopic.id, 'Publish', 2).expect(
        200,
      );

      const targetTopicResponse = await createCatalog('topics', {
        name: 'Индустриалното наследство на България',
        slug: 'industrialno-nasledstvo',
        aliases: ['Промишлено наследство'],
        summary: 'Каноничната тема за индустриалната история.',
      }).expect(201);
      const targetTopic = targetTopicResponse.body as CatalogResponse;
      await transitionCatalog('topics', targetTopic.id, 'Propose', 1).expect(
        200,
      );
      await transitionCatalog('topics', targetTopic.id, 'Publish', 2).expect(
        200,
      );

      const linkedRevisionId = randomUUID();
      await db
        .db()
        .collection<{ _id: string; [key: string]: unknown }>(
          'materialRevisions',
        )
        .insertOne({
          _id: linkedRevisionId,
          materialId: randomUUID(),
          revisionNumber: 1,
          content: { topicIds: [sourceTopic.id] },
          createdAt: new Date(),
          updatedAt: new Date(),
        });

      const editorMerge = await api
        .post(`/api/admin/v1/catalog/topics/${sourceTopic.id}/merges`)
        .auth(editor.token, { type: 'bearer' })
        .send({
          targetId: targetTopic.id,
          expectedVersion: 3,
          targetExpectedVersion: 3,
          reason: 'Дублиращи се теми.',
        })
        .expect(403);
      assert.equal(
        editorMerge.body.code,
        'catalog_merge_requires_administrator',
      );

      const merged = await api
        .post(`/api/admin/v1/catalog/topics/${sourceTopic.id}/merges`)
        .auth(administrator.token, { type: 'bearer' })
        .set('X-Correlation-ID', `catalog-merge-${randomUUID()}`)
        .send({
          targetId: targetTopic.id,
          expectedVersion: 3,
          targetExpectedVersion: 3,
          reason: 'Обединяване към проверената канонична тема.',
        })
        .expect(202);
      assert.equal(merged.body.sourceId, sourceTopic.id);
      assert.equal(merged.body.targetId, targetTopic.id);

      const mergedSource = await api
        .get(`/api/admin/v1/catalog/topics/${sourceTopic.id}`)
        .auth(editor.token, { type: 'bearer' })
        .expect(200);
      assert.equal(mergedSource.body.status, 'Merged');
      assert.equal(mergedSource.body.canonicalId, targetTopic.id);
      const canonicalTarget = await api
        .get(`/api/admin/v1/catalog/topics/${targetTopic.id}`)
        .auth(editor.token, { type: 'bearer' })
        .expect(200);
      assert.equal(canonicalTarget.body.version, 4);
      assert(
        (canonicalTarget.body.fields.aliases as string[]).includes(
          'Стара индустриална България',
        ),
      );
      const oldPublic = await api
        .get('/api/v1/catalog/topics/stara-industrialna-bulgaria')
        .redirects(0)
        .expect(308);
      assert.equal(
        oldPublic.headers.location,
        '/api/v1/catalog/topics/industrialno-nasledstvo',
      );
      await api
        .get('/api/v1/catalog/topics/industrialno-nasledstvo')
        .expect(200);
      const linkedRevision = await db
        .db()
        .collection<{
          _id: string;
          content: { topicIds: string[] };
        }>('materialRevisions')
        .findOne({ _id: linkedRevisionId });
      assert.deepEqual(linkedRevision?.content.topicIds, [sourceTopic.id]);
      const mergeAudit = await db.db().collection('auditEvents').findOne({
        targetId: sourceTopic.id,
        action: 'CatalogMerged',
      });
      assert.equal(mergeAudit?.metadata?.targetId, targetTopic.id);
      assert.equal(
        await db.db().collection('outboxEvents').countDocuments({
          aggregateId: sourceTopic.id,
          aggregateVersion: 4,
        }),
        1,
      );

      const parentResponse = await createCatalog('categories', {
        name: 'Стопанство',
        slug: 'stopanstvo',
        isVisible: true,
      }).expect(201);
      const parent = parentResponse.body as CatalogResponse;
      const childResponse = await createCatalog('categories', {
        name: 'Промишленост',
        slug: 'promishlenost',
        parentId: parent.id,
        isVisible: true,
      }).expect(201);
      const child = childResponse.body as CatalogResponse;
      const cycle = await api
        .patch(`/api/admin/v1/catalog/categories/${parent.id}`)
        .auth(editor.token, { type: 'bearer' })
        .set('If-Match', `"catalog-${parent.id}-v1"`)
        .send({ parentId: child.id })
        .expect(422);
      assert.equal(cycle.body.code, 'catalog_hierarchy_cycle');
      await transitionCatalog('categories', parent.id, 'Approve', 1).expect(
        200,
      );

      const replacementResponse = await createCatalog('categories', {
        name: 'Икономика',
        slug: 'ikonomika',
        isVisible: true,
      }).expect(201);
      const replacement = replacementResponse.body as CatalogResponse;
      await transitionCatalog(
        'categories',
        replacement.id,
        'Approve',
        1,
      ).expect(200);
      await api
        .post(`/api/admin/v1/catalog/categories/${parent.id}/merges`)
        .auth(administrator.token, { type: 'bearer' })
        .send({
          targetId: replacement.id,
          expectedVersion: 2,
          targetExpectedVersion: 2,
          reason: 'Категорията е дубликат на икономика.',
        })
        .expect(202);
      const movedChild = await api
        .get(`/api/admin/v1/catalog/categories/${child.id}`)
        .auth(editor.token, { type: 'bearer' })
        .expect(200);
      assert.equal(movedChild.body.fields.parentId, replacement.id);
      await api
        .get('/api/v1/catalog/categories/stopanstvo')
        .redirects(0)
        .expect('Location', '/api/v1/catalog/categories/ikonomika')
        .expect(308);

      const institutionResponse = await createCatalog('archive-institutions', {
        name: 'Държавен архив – Стара Загора',
        slug: 'darzhaven-arhiv-stara-zagora',
        website: 'https://www.archives.government.bg/',
      }).expect(201);
      const institution = institutionResponse.body as CatalogResponse;
      const archivalSource = await createCatalog('sources', {
        title: 'Фонд на завод Берое',
        slug: 'fond-zavod-beroe',
        sourceType: 'ArchiveDocument',
        rights: {
          publicDisplayAllowed: true,
          statement: 'Разрешено цитиране с архивна сигнатура.',
        },
        verification: { status: 'Verified', note: 'Проверено на място.' },
        archiveInstitutionId: institution.id,
        archiveReference: {
          fund: 'Ф. 214',
          inventory: 'Оп. 3',
          archiveUnit: 'а.е. 18',
          pageOrFrame: 'л. 7',
        },
        originalInstitutionName: 'Окръжен държавен архив – Стара Загора',
      }).expect(201);
      assert.equal(archivalSource.body.fields.archiveReference.fund, 'Ф. 214');

      await createCatalog('places', {
        name: 'Стара Загора',
        slug: 'stara-zagora',
        placeType: 'City',
        location: { latitude: 42.4258, longitude: 25.6345 },
        historicalNames: ['Берое', 'Августа Траяна'],
      }).expect(201);
      await createCatalog('entities', {
        name: 'Завод Берое',
        slug: 'zavod-beroe',
        entityType: 'Organisation',
        lifeSpan: { fromYear: 1958, toYear: 1999 },
      }).expect(201);
    },
  );

  void it('should keep passwords, tokens and MFA values out of application logs', () => {
    for (const value of sensitiveSamples) {
      assert(!serverLog.includes(value));
    }
  });
});

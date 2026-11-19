import { createHash } from 'node:crypto';

const password = process.env.SEED_PASSWORD;
if (!password) throw new Error('SEED_PASSWORD is required for the upload smoke test.');

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/ab8x4sAAAAASUVORK5CYII=',
  'base64',
);
const sha256 = createHash('sha256').update(png).digest('hex');

async function json(response, expected, label) {
  if (response.status !== expected) {
    throw new Error(`${label} failed with HTTP ${response.status}.`);
  }
  return response.json();
}

const login = await json(
  await fetch('http://127.0.0.1:3000/api/v1/auth/email/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'user@example.test', password }),
  }),
  200,
  'Synthetic account login',
);

const upload = await json(
  await fetch('http://127.0.0.1:3000/api/v1/media/uploads', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${login.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      purpose: 'material-original',
      length: png.length,
      sha256,
    }),
  }),
  201,
  'Upload session creation',
);

const target = new URL(upload.uploadUrl, 'http://127.0.0.1:5088');
const accepted = await fetch(target, {
  method: 'PUT',
  headers: {
    authorization: `Bearer ${upload.grant}`,
    'content-type': 'application/octet-stream',
  },
  body: png,
});
if (accepted.status !== 204) {
  throw new Error(`NestJS to SFTP upload failed with HTTP ${accepted.status}.`);
}

const repeated = await fetch(target, {
  method: 'PUT',
  headers: {
    authorization: `Bearer ${upload.grant}`,
    'content-type': 'application/octet-stream',
  },
  body: png,
});
if (repeated.status !== 409) {
  throw new Error(`Completed upload replay returned HTTP ${repeated.status}, expected 409.`);
}

process.stdout.write('NestJS -> .NET -> private SFTP upload: ok\n');

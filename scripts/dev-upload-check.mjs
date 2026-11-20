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

let asset;
for (let attempt = 0; attempt < 80; attempt++) {
  const response = await fetch(
    `http://127.0.0.1:3000/api/v1/media/assets/${upload.uploadId}`,
    { headers: { authorization: `Bearer ${login.token}` } },
  );
  asset = await json(response, 200, 'Media processing status');
  if (asset.processingStatus === 'Ready') break;
  if (asset.processingStatus === 'Failed') {
    throw new Error('Media inspection rejected the uploaded fixture.');
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}
if (asset?.processingStatus !== 'Ready') {
  throw new Error('Media inspection did not finish before the smoke-test deadline.');
}
if (!asset.variants.includes('preview')) {
  throw new Error('Ready media does not advertise its verified preview.');
}

const read = await json(
  await fetch(
    `http://127.0.0.1:3000/api/v1/media/assets/${upload.uploadId}/read-grants`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${login.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ variant: 'preview' }),
    },
  ),
  201,
  'Preview read grant',
);
const previewUrl = new URL(read.url, 'http://127.0.0.1:5088');
const preview = await fetch(previewUrl, {
  headers: { authorization: `Bearer ${read.grant}` },
});
if (preview.status !== 200 || !Buffer.from(await preview.arrayBuffer()).equals(png)) {
  throw new Error(`Verified preview read failed with HTTP ${preview.status}.`);
}

const range = await fetch(previewUrl, {
  headers: {
    authorization: `Bearer ${read.grant}`,
    range: 'bytes=0-3',
  },
});
if (range.status !== 206 || !Buffer.from(await range.arrayBuffer()).equals(png.subarray(0, 4))) {
  throw new Error(`Verified preview Range read failed with HTTP ${range.status}.`);
}

process.stdout.write('NestJS -> .NET -> private SFTP upload, inspection and Range read: ok\n');

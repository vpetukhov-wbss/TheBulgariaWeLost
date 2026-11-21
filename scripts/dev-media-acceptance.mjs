import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import http from "node:http";
import { dirname, resolve } from "node:path";

const password = process.env.SEED_PASSWORD;
if (!password) {
  throw new Error("SEED_PASSWORD is required for the media acceptance test.");
}

const origin = process.env.WEB_ORIGIN ?? "http://127.0.0.1:4200";
const reportPath = resolve(
  process.env.MEDIA_ACCEPTANCE_REPORT ??
    ".dev/media-vertical-slice-acceptance.json",
);
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/ab8x4sAAAAASUVORK5CYII=",
  "base64",
);
const pdf = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n",
  "ascii",
);

const report = {
  protocol: "media-vertical-slice-v1",
  startedAtUtc: new Date().toISOString(),
  status: "running",
  origin,
  fixtures: "synthetic",
  flows: [],
};

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function wait(milliseconds) {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertCorrelation(response, correlationId, label) {
  assert(
    response.headers.get("x-correlation-id") === correlationId,
    `${label} did not echo the expected correlation ID.`,
  );
}

async function expectJson(response, expected, label, correlationId) {
  if (correlationId) assertCorrelation(response, correlationId, label);
  if (response.status !== expected) {
    throw new Error(`${label} failed with HTTP ${response.status}.`);
  }
  return response.json();
}

async function expectProblem(response, expected, label, correlationId) {
  assertCorrelation(response, correlationId, label);
  const body = await response.json();
  assert(
    response.status === expected,
    `${label} returned HTTP ${response.status}, expected ${expected}.`,
  );
  assert(
    body.traceId === correlationId,
    `${label} problem details are not traceable by correlation ID.`,
  );
  return body;
}

async function login() {
  return expectJson(
    await fetch(new URL("/api/v1/auth/email/login", origin), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "user@example.test", password }),
    }),
    200,
    "Synthetic account login",
  );
}

async function createUpload(token, flow, bytes) {
  const response = await fetch(new URL("/api/v1/media/uploads", origin), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-correlation-id": flow.correlationId,
    },
    body: JSON.stringify({
      purpose: flow.purpose,
      length: bytes.length,
      sha256: hash(bytes),
      alternativeText: flow.alternativeText,
      rightsEvidence: flow.rightsEvidence,
    }),
  });
  const upload = await expectJson(
    response,
    201,
    `${flow.name} upload session`,
    flow.correlationId,
  );
  flow.uploadId = upload.uploadId;
  flow.sha256 = hash(bytes);
  flow.length = bytes.length;
  flow.steps.push({ name: "session-created", status: 201 });
  return upload;
}

function interruptUpload(target, grant, bytes, correlationId) {
  return new Promise((resolveInterrupt, reject) => {
    const url = new URL(target, origin);
    let deliberatelyAborted = false;
    const request = http.request(
      url,
      {
        method: "PUT",
        headers: {
          authorization: `Bearer ${grant}`,
          "content-type": "application/octet-stream",
          "content-length": bytes.length,
          "x-correlation-id": correlationId,
        },
      },
      (response) => {
        response.resume();
        reject(
          new Error(
            `Interrupted upload unexpectedly returned HTTP ${response.statusCode}.`,
          ),
        );
      },
    );
    request.on("error", (error) => {
      if (deliberatelyAborted && error.code === "ECONNRESET") {
        resolveInterrupt();
        return;
      }
      reject(error);
    });
    request.on("close", () => {
      if (deliberatelyAborted) resolveInterrupt();
    });
    request.write(bytes.subarray(0, Math.max(1, Math.floor(bytes.length / 2))));
    setTimeout(() => {
      deliberatelyAborted = true;
      request.destroy();
    }, 750);
  });
}

async function uploadBytes(upload, bytes, correlationId) {
  return fetch(new URL(upload.uploadUrl, origin), {
    method: "PUT",
    headers: {
      authorization: `Bearer ${upload.grant}`,
      "content-type": "application/octet-stream",
      "x-correlation-id": correlationId,
    },
    body: bytes,
  });
}

async function awaitReady(token, flow) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await fetch(
      new URL(`/api/v1/media/assets/${flow.uploadId}`, origin),
      {
        headers: {
          authorization: `Bearer ${token}`,
          "x-correlation-id": flow.correlationId,
        },
      },
    );
    const asset = await expectJson(
      response,
      200,
      `${flow.name} processing status`,
      flow.correlationId,
    );
    if (asset.processingStatus === "Ready") return asset;
    if (asset.processingStatus === "Failed") {
      throw new Error(
        `${flow.name} inspection rejected the synthetic fixture.`,
      );
    }
    await wait(250);
  }
  throw new Error(
    `${flow.name} inspection did not finish before the deadline.`,
  );
}

async function verifyAsset(token, flow, bytes, expectedType) {
  const asset = await awaitReady(token, flow);
  assert(
    asset.contentType === expectedType,
    `${flow.name} content type differs.`,
  );
  assert(
    asset.alternativeText === flow.alternativeText,
    `${flow.name} alternative text differs.`,
  );
  assert(
    asset.rightsEvidence === flow.rightsEvidence,
    `${flow.name} rights evidence differs.`,
  );
  assert(
    asset.correlationId === flow.correlationId,
    `${flow.name} metadata lost its originating correlation ID.`,
  );
  assert(
    asset.variants.includes("preview"),
    `${flow.name} has no verified preview variant.`,
  );
  flow.contentType = asset.contentType;
  flow.steps.push({ name: "metadata-and-rights-verified", status: 200 });

  const grant = await expectJson(
    await fetch(
      new URL(`/api/v1/media/assets/${flow.uploadId}/read-grants`, origin),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "x-correlation-id": flow.correlationId,
        },
        body: JSON.stringify({ variant: "preview" }),
      },
    ),
    201,
    `${flow.name} preview grant`,
    flow.correlationId,
  );
  const previewUrl = new URL(grant.url, origin);
  const preview = await fetch(previewUrl, {
    headers: {
      authorization: `Bearer ${grant.grant}`,
      "x-correlation-id": flow.correlationId,
    },
  });
  assertCorrelation(preview, flow.correlationId, `${flow.name} preview`);
  assert(
    preview.status === 200,
    `${flow.name} preview returned ${preview.status}.`,
  );
  assert(
    Buffer.from(await preview.arrayBuffer()).equals(bytes),
    `${flow.name} preview bytes differ.`,
  );

  const range = await fetch(previewUrl, {
    headers: {
      authorization: `Bearer ${grant.grant}`,
      range: "bytes=0-3",
      "x-correlation-id": flow.correlationId,
    },
  });
  assertCorrelation(range, flow.correlationId, `${flow.name} Range preview`);
  assert(range.status === 206, `${flow.name} Range returned ${range.status}.`);
  assert(
    Buffer.from(await range.arrayBuffer()).equals(bytes.subarray(0, 4)),
    `${flow.name} Range bytes differ.`,
  );
  flow.steps.push({ name: "preview-and-range-read", status: 206 });
}

function newFlow(name, purpose, alternativeText, rightsEvidence) {
  return {
    name,
    purpose,
    alternativeText,
    rightsEvidence,
    correlationId: `media-acceptance-${randomUUID()}`,
    steps: [],
  };
}

async function run() {
  const session = await login();
  const image = newFlow(
    "archive-image",
    "material-original",
    "Синтетична архивна снимка за приемателен тест.",
    "Синтетичен тестов материал; проверен произход и разрешение за тестова публикация.",
  );
  report.flows.push(image);
  const imageUpload = await createUpload(session.token, image, png);

  await interruptUpload(
    imageUpload.uploadUrl,
    imageUpload.grant,
    png,
    image.correlationId,
  );
  image.steps.push({
    name: "transfer-interrupted",
    status: "connection-reset",
  });

  const activeLease = await uploadBytes(imageUpload, png, image.correlationId);
  const leaseProblem = await expectProblem(
    activeLease,
    409,
    "Retry while interrupted attempt is leased",
    image.correlationId,
  );
  assert(
    leaseProblem.code === "media_conflict",
    "Active lease retry returned an unexpected problem code.",
  );
  image.steps.push({ name: "active-attempt-protected", status: 409 });

  await wait(3_000);
  const recovered = await uploadBytes(imageUpload, png, image.correlationId);
  assertCorrelation(recovered, image.correlationId, "Recovered image upload");
  assert(
    recovered.status === 204,
    `Recovered image upload returned HTTP ${recovered.status}.`,
  );
  image.steps.push({ name: "new-attempt-recovered", status: 204 });
  await verifyAsset(session.token, image, png, "image/png");

  const replay = await uploadBytes(imageUpload, png, image.correlationId);
  await expectProblem(
    replay,
    409,
    "Completed image upload replay",
    image.correlationId,
  );
  image.steps.push({ name: "completed-upload-protected", status: 409 });

  const document = newFlow(
    "source-pdf",
    "source-document",
    "Синтетичен PDF източник за архивния материал.",
    "Синтетичен тестов документ; проверен произход и разрешение за тестова публикация.",
  );
  report.flows.push(document);
  const documentUpload = await createUpload(session.token, document, pdf);
  const documentAccepted = await uploadBytes(
    documentUpload,
    pdf,
    document.correlationId,
  );
  assertCorrelation(documentAccepted, document.correlationId, "PDF upload");
  assert(
    documentAccepted.status === 204,
    `PDF upload returned HTTP ${documentAccepted.status}.`,
  );
  document.steps.push({ name: "uploaded", status: 204 });
  await verifyAsset(session.token, document, pdf, "application/pdf");

  report.status = "passed";
}

try {
  await run();
} catch (error) {
  report.status = "failed";
  report.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  report.finishedAtUtc = new Date().toISOString();
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o600,
  });
}

if (report.status !== "passed") {
  throw new Error(report.error ?? "Media acceptance failed.");
}

process.stdout.write(
  `Archive image and PDF vertical slice accepted; report=${reportPath}\n`,
);

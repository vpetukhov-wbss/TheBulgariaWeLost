import { readFile } from 'node:fs/promises';

async function run() {
  const [action, id, file] = process.argv.slice(2);
  const report = action === 'report';
  if (
    !['check', 'report'].includes(action) ||
    (report && (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id) || !file))
  ) {
    throw new Error('Usage: node scripts/operations.mjs check | report <UUID-v7> <report.json>');
  }

  const token = process.env.OPERATIONS_BACKUP_REPORT_TOKEN;
  const origin = process.env.OPERATIONS_API_ORIGIN;
  if (!token || !origin) {
    throw new Error('Set OPERATIONS_API_ORIGIN and OPERATIONS_BACKUP_REPORT_TOKEN.');
  }

  const base = new URL(origin);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('OPERATIONS_API_ORIGIN must be a plain HTTP(S) origin.');
  }

  const response = await fetch(new URL(
    report ? '/internal/operations/v1/backups/' + id : '/internal/operations/v1/alerts',
    base,
  ), {
    method: report ? 'PUT' : 'GET',
    headers: { Authorization: 'Bearer ' + token, ...(report ? { 'Content-Type': 'application/json' } : {}) },
    ...(report ? { body: await readFile(file, 'utf8') } : {}),
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) throw new Error('Operations API returned HTTP ' + response.status + '.');
  const data = await response.json();
  if (!report && !Array.isArray(data.alerts)) throw new Error('Operations API returned an invalid alert response.');
  console.log(JSON.stringify(report ? data : { measuredAtUtc: data.measuredAtUtc, alerts: data.alerts }));
  if (!report && data.alerts.length) process.exitCode = 2;
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

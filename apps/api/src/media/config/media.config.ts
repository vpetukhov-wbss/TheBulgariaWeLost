import { registerAs } from '@nestjs/config';
import type { MediaConfig } from './media-config.type';

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

export default registerAs<MediaConfig>('media', () => {
  const production = process.env.NODE_ENV === 'production';
  const serviceToken =
    process.env.MEDIA_SERVICE_TOKEN?.trim() ||
    process.env.AUTH_REFRESH_SECRET ||
    '';
  const uploadGrantSecret =
    process.env.MEDIA_UPLOAD_GRANT_SECRET?.trim() ||
    process.env.AUTH_CONFIRM_EMAIL_SECRET ||
    '';
  const readGrantSecret =
    process.env.MEDIA_READ_GRANT_SECRET?.trim() || uploadGrantSecret;
  if (!serviceToken || !uploadGrantSecret || !readGrantSecret) {
    throw new Error(
      'MEDIA_SERVICE_TOKEN, MEDIA_UPLOAD_GRANT_SECRET and MEDIA_READ_GRANT_SECRET are required.',
    );
  }
  if (
    production &&
    (!process.env.MEDIA_SERVICE_TOKEN ||
      !process.env.MEDIA_UPLOAD_GRANT_SECRET ||
      !process.env.MEDIA_READ_GRANT_SECRET ||
      serviceToken.length < 32 ||
      uploadGrantSecret.length < 32 ||
      readGrantSecret.length < 32 ||
      new Set([serviceToken, uploadGrantSecret, readGrantSecret]).size !== 3)
  ) {
    throw new Error(
      'Production media credentials must be explicit, independent and at least 32 characters.',
    );
  }

  const defaultStorageLocationId =
    process.env.MEDIA_DEFAULT_STORAGE_LOCATION_ID ?? 'archive';
  if (!/^[a-z0-9][a-z0-9_-]{0,99}$/i.test(defaultStorageLocationId)) {
    throw new Error('MEDIA_DEFAULT_STORAGE_LOCATION_ID is invalid.');
  }
  const probeOrigin = process.env.MEDIA_PROBE_ORIGIN?.trim() ?? '';
  const probeToken = process.env.MEDIA_PROBE_TOKEN?.trim() ?? '';
  if (probeOrigin || probeToken) {
    if (
      !/^https?:\/\/[^/?#@]+\/?$/.test(probeOrigin) ||
      probeToken.length < 32 ||
      [serviceToken, uploadGrantSecret, readGrantSecret].includes(probeToken)
    ) {
      throw new Error(
        'Set MEDIA_PROBE_ORIGIN and an independent MEDIA_PROBE_TOKEN of at least 32 characters.',
      );
    }
  }

  const backupReportToken =
    process.env.OPERATIONS_BACKUP_REPORT_TOKEN?.trim() ?? '';
  if (
    backupReportToken &&
    (backupReportToken.length < 32 ||
      [
        serviceToken,
        uploadGrantSecret,
        readGrantSecret,
        probeToken,
        process.env.AUTH_JWT_SECRET,
        process.env.AUTH_REFRESH_SECRET,
      ].includes(backupReportToken))
  ) {
    throw new Error(
      'OPERATIONS_BACKUP_REPORT_TOKEN must be independent and at least 32 characters.',
    );
  }

  return {
    backupReportToken,
    backupMaxAgeHours: positiveInteger('OPERATIONS_BACKUP_MAX_AGE_HOURS', 30),
    serviceToken,
    uploadGrantSecret,
    readGrantSecret,
    uploadGrantExpiresSeconds: positiveInteger(
      'MEDIA_UPLOAD_GRANT_EXPIRES_IN_SECONDS',
      10 * 60,
    ),
    uploadLeaseSeconds: positiveInteger('MEDIA_UPLOAD_LEASE_SECONDS', 5 * 60),
    readGrantExpiresSeconds: positiveInteger(
      'MEDIA_READ_GRANT_EXPIRES_IN_SECONDS',
      5 * 60,
    ),
    inspectionLeaseSeconds: positiveInteger(
      'MEDIA_INSPECTION_LEASE_SECONDS',
      2 * 60,
    ),
    maxUploadBytes: positiveInteger('MEDIA_MAX_UPLOAD_BYTES', 32 * 1024 * 1024),
    accountQuotaBytes: positiveInteger(
      'MEDIA_ACCOUNT_QUOTA_BYTES',
      1024 * 1024 * 1024,
    ),
    defaultStorageLocationId,
    probeOrigin,
    probeToken,
  };
});

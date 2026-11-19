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
  if (!serviceToken || !uploadGrantSecret) {
    throw new Error(
      'MEDIA_SERVICE_TOKEN and MEDIA_UPLOAD_GRANT_SECRET are required.',
    );
  }
  if (
    production &&
    (!process.env.MEDIA_SERVICE_TOKEN ||
      !process.env.MEDIA_UPLOAD_GRANT_SECRET ||
      serviceToken.length < 32 ||
      uploadGrantSecret.length < 32)
  ) {
    throw new Error(
      'Production media credentials must be explicit and at least 32 characters.',
    );
  }

  const defaultStorageLocationId =
    process.env.MEDIA_DEFAULT_STORAGE_LOCATION_ID ?? 'archive';
  if (!/^[a-z0-9][a-z0-9_-]{0,99}$/i.test(defaultStorageLocationId)) {
    throw new Error('MEDIA_DEFAULT_STORAGE_LOCATION_ID is invalid.');
  }

  return {
    serviceToken,
    uploadGrantSecret,
    uploadGrantExpiresSeconds: positiveInteger(
      'MEDIA_UPLOAD_GRANT_EXPIRES_IN_SECONDS',
      10 * 60,
    ),
    uploadLeaseSeconds: positiveInteger('MEDIA_UPLOAD_LEASE_SECONDS', 5 * 60),
    maxUploadBytes: positiveInteger('MEDIA_MAX_UPLOAD_BYTES', 32 * 1024 * 1024),
    accountQuotaBytes: positiveInteger(
      'MEDIA_ACCOUNT_QUOTA_BYTES',
      1024 * 1024 * 1024,
    ),
    defaultStorageLocationId,
  };
});

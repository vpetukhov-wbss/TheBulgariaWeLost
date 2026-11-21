import { authFoundationMigration } from './001-auth-foundation.mjs';
import { mediaUploadsMigration } from './002-media-uploads.mjs';
import { mediaProcessingMigration } from './003-media-processing.mjs';
import { mediaCorrelationMigration } from './004-media-correlation.mjs';

export const migrations = [
  authFoundationMigration,
  mediaUploadsMigration,
  mediaProcessingMigration,
  mediaCorrelationMigration,
];

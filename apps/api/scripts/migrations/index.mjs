import { authFoundationMigration } from './001-auth-foundation.mjs';
import { mediaUploadsMigration } from './002-media-uploads.mjs';
import { mediaProcessingMigration } from './003-media-processing.mjs';
import { mediaCorrelationMigration } from './004-media-correlation.mjs';
import { publishingFoundationMigration } from './005-publishing-foundation.mjs';

export const migrations = [
  authFoundationMigration,
  mediaUploadsMigration,
  mediaProcessingMigration,
  mediaCorrelationMigration,
  publishingFoundationMigration,
];

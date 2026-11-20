import { authFoundationMigration } from './001-auth-foundation.mjs';
import { mediaUploadsMigration } from './002-media-uploads.mjs';
import { mediaProcessingMigration } from './003-media-processing.mjs';

export const migrations = [
  authFoundationMigration,
  mediaUploadsMigration,
  mediaProcessingMigration,
];

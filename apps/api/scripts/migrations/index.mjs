import { authFoundationMigration } from './001-auth-foundation.mjs';
import { mediaUploadsMigration } from './002-media-uploads.mjs';

export const migrations = [authFoundationMigration, mediaUploadsMigration];

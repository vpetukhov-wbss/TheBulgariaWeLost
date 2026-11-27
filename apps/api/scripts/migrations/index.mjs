import { archiveSearchMigration } from './015-archive-search.mjs';
import { authFoundationMigration } from './001-auth-foundation.mjs';
import { mediaUploadsMigration } from './002-media-uploads.mjs';
import { mediaProcessingMigration } from './003-media-processing.mjs';
import { mediaCorrelationMigration } from './004-media-correlation.mjs';
import { publishingFoundationMigration } from './005-publishing-foundation.mjs';
import { catalogTaxonomyMigration } from './006-catalog-taxonomy.mjs';
import { authorBookmarksMigration } from './007-author-bookmarks.mjs';
import { materialModerationMigration } from './008-material-moderation.mjs';
import { adminUserActionsMigration } from './009-admin-user-actions.mjs';
import { auditJournalMigration } from './010-audit-journal.mjs';
import { siteSettingsMigration } from './011-site-settings.mjs';
import { adminMediaGalleryMigration } from './012-admin-media-gallery.mjs';
import { operationsMigration } from './014-operations.mjs';
import { storageAdminMigration } from './013-storage-admin.mjs';

export const migrations = [
  authFoundationMigration,
  mediaUploadsMigration,
  mediaProcessingMigration,
  mediaCorrelationMigration,
  publishingFoundationMigration,
  catalogTaxonomyMigration,
  authorBookmarksMigration,
  materialModerationMigration,
  adminUserActionsMigration,
  auditJournalMigration,
  siteSettingsMigration,
  adminMediaGalleryMigration,
  storageAdminMigration,
  operationsMigration,
  archiveSearchMigration,
];

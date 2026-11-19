const indexes = [
  {
    collection: 'mediaUploads',
    key: { fileKey: 1 },
    options: { name: 'fileKey_1', unique: true },
  },
  {
    collection: 'mediaUploads',
    key: { accountId: 1, status: 1, expiresAt: 1 },
    options: { name: 'accountId_1_status_1_expiresAt_1' },
  },
  {
    collection: 'mediaUploads',
    key: { status: 1, leaseExpiresAt: 1 },
    options: { name: 'status_1_leaseExpiresAt_1' },
  },
];

export const mediaUploadsMigration = {
  id: '002-media-uploads',
  version: 2,
  description: 'Create upload control-plane collections and indexes.',
  signature: 'media-uploads-v1-fixed-storage-quota-and-attempt-leases',
  indexes,
  async up({ database, session }) {
    await database
      .collection('mediaUploads')
      .updateMany(
        { schemaVersion: { $exists: false } },
        { $set: { schemaVersion: 1 } },
        { session },
      );
    await database
      .collection('mediaQuotas')
      .updateMany(
        { schemaVersion: { $exists: false } },
        { $set: { schemaVersion: 1 } },
        { session },
      );
  },
};

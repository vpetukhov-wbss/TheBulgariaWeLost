export const storageAdminMigration = {
  id: '013-storage-admin',
  version: 13,
  description:
    'Index SFTP administration receipts and media by physical storage profile.',
  signature: 'storage-admin-v1',
  indexes: [
    {
      collection: 'mediaUploads',
      key: { storageLocationId: 1, status: 1, _id: 1 },
      options: { name: 'storageLocationId_1_status_1__id_1' },
    },
    {
      collection: 'storageCommands',
      key: { expiresAt: 1 },
      options: { name: 'expiresAt_1', expireAfterSeconds: 0 },
    },
  ],
  async up() {},
};

export const adminMediaGalleryMigration = {
  id: '012-admin-media-gallery',
  version: 12,
  description:
    'Index completed media, material usages and access command receipts.',
  signature: 'admin-media-gallery-v1',
  indexes: [
    {
      collection: 'mediaUploads',
      key: { status: 1, _id: -1 },
      options: { name: 'status_1__id_-1' },
    },
    {
      collection: 'materialRevisions',
      key: { 'content.mediaRefs.mediaId': 1 },
      options: { name: 'content.mediaRefs.mediaId_1' },
    },
    {
      collection: 'mediaAccessCommands',
      key: { expiresAt: 1 },
      options: { name: 'expiresAt_1', expireAfterSeconds: 0 },
    },
  ],
  async up() {},
};

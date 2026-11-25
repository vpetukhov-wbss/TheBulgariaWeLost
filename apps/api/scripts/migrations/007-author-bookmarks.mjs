export const authorBookmarksMigration = {
  id: '007-author-bookmarks',
  version: 7,
  description: 'Index each account’s saved materials by date.',
  signature: 'author-bookmarks-v1-account-and-saved-date',
  indexes: [
    {
      collection: 'savedMaterials',
      key: { accountId: 1, savedAt: -1, _id: -1 },
      options: { name: 'accountId_1_savedAt_-1__id_-1' },
    },
  ],
  async up() {},
};

export const archiveSearchMigration = {
  id: '015-archive-search',
  version: 15,
  description: 'Index the archive search outbox backlog.',
  signature: 'archive-search-v1',
  indexes: [
    {
      collection: 'outboxEvents',
      key: { searchProjectedAt: 1, occurredAt: 1, _id: 1 },
      options: { name: 'searchProjectedAt_1_occurredAt_1__id_1' },
    },
  ],
  async up() {},
};

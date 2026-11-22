const indexes = [
  {
    collection: 'materials',
    key: { slug: 1 },
    options: { name: 'slug_1', unique: true },
  },
  {
    collection: 'materials',
    key: { updatedAt: -1, _id: -1 },
    options: { name: 'updatedAt_-1__id_-1' },
  },
  {
    collection: 'materials',
    key: { authorId: 1, updatedAt: -1, _id: -1 },
    options: { name: 'authorId_1_updatedAt_-1__id_-1' },
  },
  {
    collection: 'materials',
    key: { status: 1, workingStatus: 1, updatedAt: -1, _id: -1 },
    options: { name: 'status_1_workingStatus_1_updatedAt_-1__id_-1' },
  },
  {
    collection: 'materialRevisions',
    key: { materialId: 1, revisionNumber: 1 },
    options: { name: 'materialId_1_revisionNumber_1', unique: true },
  },
  {
    collection: 'materialRevisions',
    key: { materialId: 1, revisionNumber: -1 },
    options: { name: 'materialId_1_revisionNumber_-1' },
  },
  {
    collection: 'auditEvents',
    key: { targetId: 1, occurredAt: -1, _id: -1 },
    options: { name: 'targetId_1_occurredAt_-1__id_-1' },
  },
  {
    collection: 'auditEvents',
    key: { correlationId: 1, _id: 1 },
    options: { name: 'correlationId_1__id_1' },
  },
  {
    collection: 'outboxEvents',
    key: { aggregateId: 1, aggregateVersion: 1 },
    options: { name: 'aggregateId_1_aggregateVersion_1', unique: true },
  },
  {
    collection: 'outboxEvents',
    key: { publishedAt: 1, occurredAt: 1, _id: 1 },
    options: { name: 'publishedAt_1_occurredAt_1__id_1' },
  },
];

export const publishingFoundationMigration = {
  id: '005-publishing-foundation',
  version: 5,
  description: 'Create material, revision, audit and outbox indexes.',
  signature: 'publishing-foundation-v1-transactional-revisions-and-events',
  indexes,
  async up() {},
};

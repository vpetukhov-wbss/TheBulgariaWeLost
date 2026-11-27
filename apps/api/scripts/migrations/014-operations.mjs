export const operationsMigration = {
  id: '014-operations',
  version: 14,
  description:
    'Index jobs, runtime heartbeats, retry receipts and backup reports.',
  signature: 'operations-v1',
  indexes: [
    {
      collection: 'mediaUploads',
      key: { status: 1, processingStatus: 1, _id: -1 },
      options: { name: 'status_1_processingStatus_1__id_-1' },
    },
    {
      collection: 'mediaWorkerHeartbeats',
      key: { expiresAt: 1 },
      options: { name: 'expiresAt_1', expireAfterSeconds: 86400 },
    },
    {
      collection: 'jobRetryCommands',
      key: { expiresAt: 1 },
      options: { name: 'expiresAt_1', expireAfterSeconds: 0 },
    },
    {
      collection: 'backupRuns',
      key: { scope: 1, storageLocationId: 1, status: 1, finishedAt: -1 },
      options: { name: 'scope_1_storageLocationId_1_status_1_finishedAt_-1' },
    },
  ],
  async up() {},
};

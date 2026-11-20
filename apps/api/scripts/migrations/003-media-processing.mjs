const indexes = [
  {
    collection: 'mediaUploads',
    key: {
      status: 1,
      processingStatus: 1,
      inspectionLeaseExpiresAt: 1,
      completedAt: 1,
    },
    options: {
      name: 'status_1_processingStatus_1_inspectionLeaseExpiresAt_1_completedAt_1',
    },
  },
];

export const mediaProcessingMigration = {
  id: '003-media-processing',
  version: 3,
  description: 'Add inspection leases, derivative metadata and access state.',
  signature: 'media-processing-v1-attempt-preview-and-revocable-read-grants',
  indexes,
  async up({ database, session }) {
    const uploads = database.collection('mediaUploads');
    await uploads.updateMany(
      {},
      [
        {
          $set: {
            schemaVersion: 2,
            accessStatus: { $ifNull: ['$accessStatus', 'Active'] },
            accessVersion: { $ifNull: ['$accessVersion', 1] },
          },
        },
      ],
      { session },
    );
    await uploads.updateMany(
      { status: 'Completed', processingStatus: { $exists: false } },
      { $set: { processingStatus: 'Pending' } },
      { session },
    );
  },
};

const indexes = [
  {
    collection: 'mediaUploads',
    key: { correlationId: 1, _id: 1 },
    options: { name: 'correlationId_1__id_1' },
  },
];

export const mediaCorrelationMigration = {
  id: '004-media-correlation',
  version: 4,
  description: 'Make media metadata traceable to its originating request.',
  signature: 'media-correlation-v1-origin-id-and-index',
  indexes,
  async up({ database, session }) {
    await database.collection('mediaUploads').updateMany(
      {},
      [
        {
          $set: {
            schemaVersion: 3,
            correlationId: {
              $ifNull: [
                '$correlationId',
                {
                  $concat: [
                    'migration:',
                    { $substrBytes: [{ $toString: '$_id' }, 0, 110] },
                  ],
                },
              ],
            },
          },
        },
      ],
      { session },
    );
  },
};

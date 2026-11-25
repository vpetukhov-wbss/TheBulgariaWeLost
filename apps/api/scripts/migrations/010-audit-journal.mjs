const chronological = { occurredAt: -1, _id: -1 };
const targetTypes = ['Account', 'Catalog', 'Material', 'Moderation'];

export const auditJournalMigration = {
  id: '010-audit-journal',
  version: 10,
  description:
    'Classify historical audit events and index the administrator journal.',
  signature: 'audit-journal-v1',
  indexes: [
    {
      collection: 'auditEvents',
      key: chronological,
      options: { name: 'occurredAt_-1__id_-1' },
    },
    {
      collection: 'auditEvents',
      key: { actorId: 1, ...chronological },
      options: { name: 'actorId_1_occurredAt_-1__id_-1' },
    },
    {
      collection: 'auditEvents',
      key: { targetType: 1, ...chronological },
      options: { name: 'targetType_1_occurredAt_-1__id_-1' },
    },
    {
      collection: 'auditAccessEvents',
      key: chronological,
      options: { name: 'occurredAt_-1__id_-1' },
    },
  ],
  async up({ database, session }) {
    const action = { $ifNull: ['$action', ''] };
    await database.collection('auditEvents').updateMany(
      { $or: [{ targetType: null }, { outcome: null }] },
      [
        {
          $set: {
            targetType: {
              $ifNull: [
                '$targetType',
                {
                  $switch: {
                    branches: targetTypes.map((type) => ({
                      case: {
                        $regexMatch: { input: action, regex: '^' + type },
                      },
                      then: type,
                    })),
                    default: 'Other',
                  },
                },
              ],
            },
            outcome: {
              $ifNull: [
                '$outcome',
                {
                  $cond: [
                    { $regexMatch: { input: action, regex: 'Failed$' } },
                    'Failed',
                    'Succeeded',
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

export const adminUserActionsMigration = {
  id: '009-admin-user-actions',
  version: 9,
  description:
    'Version managed profiles and index sanctions, command receipts and reset audit limits.',
  signature: 'admin-user-actions-v1',
  indexes: [
    {
      collection: 'accountSanctions',
      key: { userId: 1, _id: -1 },
      options: { name: 'userId_1__id_-1' },
    },
    {
      collection: 'adminUserCommands',
      key: { expiresAt: 1 },
      options: { name: 'expiresAt_1', expireAfterSeconds: 0 },
    },
    {
      collection: 'auditEvents',
      key: { action: 1, actorId: 1, occurredAt: -1 },
      options: { name: 'action_1_actorId_1_occurredAt_-1' },
    },
  ],
  async up({ database, session }) {
    await database
      .collection('users')
      .updateMany(
        { adminVersion: { $exists: false } },
        { $set: { adminVersion: 1 } },
        { session },
      );
    await database
      .collection('administratorAccess')
      .updateOne(
        { _id: 'active-administrator' },
        { $setOnInsert: { version: 0 } },
        { upsert: true, session },
      );
  },
};

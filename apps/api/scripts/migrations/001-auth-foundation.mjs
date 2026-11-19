const indexes = [
  {
    collection: 'users',
    key: { email: 1 },
    options: { name: 'email_1', unique: true },
  },
  {
    collection: 'users',
    key: { role: 1, status: 1, _id: 1 },
    options: { name: 'role_1_status_1__id_1' },
  },
  {
    collection: 'sessions',
    key: { accountId: 1 },
    options: { name: 'accountId_1' },
  },
  {
    collection: 'sessions',
    key: { expiresAt: 1 },
    options: { name: 'expiresAt_1', expireAfterSeconds: 0 },
  },
  {
    collection: 'sessions',
    key: { accountId: 1, authVersion: 1, expiresAt: 1 },
    options: { name: 'accountId_1_authVersion_1_expiresAt_1' },
  },
];

export const authFoundationMigration = {
  id: '001-auth-foundation',
  version: 1,
  description: 'Version the account and session collections and their indexes.',
  signature: 'auth-foundation-v1-schema-version-and-indexes',
  indexes,
  async up({ database, session }) {
    await database
      .collection('users')
      .updateMany(
        { schemaVersion: { $exists: false } },
        { $set: { schemaVersion: 1 } },
        { session },
      );
    await database
      .collection('sessions')
      .updateMany(
        { schemaVersion: { $exists: false } },
        { $set: { schemaVersion: 1 } },
        { session },
      );
  },
};

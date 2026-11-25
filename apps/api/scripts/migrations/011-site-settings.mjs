export const siteSettingsMigration = {
  id: '011-site-settings',
  version: 11,
  description: 'Initialize the singleton site settings at version one.',
  signature: 'site-settings-v1',
  async up({ database, session }) {
    await database
      .collection('siteSettings')
      .updateOne(
        { _id: '019a9451-2b60-7000-8000-000000000901' },
        { $setOnInsert: { schemaVersion: 1, version: 1 } },
        { upsert: true, session },
      );
  },
};

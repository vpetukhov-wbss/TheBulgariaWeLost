export const materialModerationMigration = {
  id: '008-material-moderation',
  version: 8,
  description: 'Index material moderation cases and anonymous reports.',
  signature: 'material-moderation-v1',
  indexes: [
    {
      collection: 'moderationCases',
      key: { targetId: 1, caseType: 1 },
      options: {
        name: 'active_target_and_type',
        unique: true,
        partialFilterExpression: { active: true },
      },
    },
    {
      collection: 'moderationCases',
      key: { status: 1, priority: 1, updatedAt: -1, _id: -1 },
      options: { name: 'status_1_priority_1_updatedAt_-1__id_-1' },
    },
    {
      collection: 'moderationReports',
      key: { caseId: 1, createdAt: -1, _id: -1 },
      options: { name: 'caseId_1_createdAt_-1__id_-1' },
    },
    {
      collection: 'moderationReports',
      key: { requestHash: 1 },
      options: { name: 'requestHash_1', unique: true },
    },
  ],
  async up() {},
};

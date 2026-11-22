const collections = [
  'topics',
  'categories',
  'entities',
  'places',
  'sources',
  'archiveInstitutions',
];

const indexes = collections.flatMap((collection) => [
  {
    collection,
    key: { slug: 1 },
    options: { name: 'slug_1', unique: true },
  },
  {
    collection,
    key: { status: 1, updatedAt: -1, _id: -1 },
    options: { name: 'status_1_updatedAt_-1__id_-1' },
  },
  {
    collection,
    key: { parentId: 1, sortOrder: 1, name: 1, _id: 1 },
    options: { name: 'parentId_1_sortOrder_1_name_1__id_1' },
  },
]);

export const catalogTaxonomyMigration = {
  id: '006-catalog-taxonomy',
  version: 6,
  description: 'Create catalog hierarchy, lookup and canonical slug indexes.',
  signature: 'catalog-taxonomy-v1-six-collections-and-canonical-merges',
  indexes,
  async up() {},
};

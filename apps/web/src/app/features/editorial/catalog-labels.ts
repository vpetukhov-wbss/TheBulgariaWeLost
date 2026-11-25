import type { CatalogSummary } from '../../api/generated/models/catalog-summary';

export const catalogKinds = {
  topics: 'Теми',
  categories: 'Категории',
  entities: 'Личности и организации',
  places: 'Места',
  sources: 'Източници',
  'archive-institutions': 'Архивни институции',
} satisfies Record<CatalogSummary['kind'], string>;

export const catalogStatuses = {
  Draft: 'Чернова',
  Proposed: 'Предложен',
  Published: 'Публикуван',
  Restricted: 'Ограничен',
  Rejected: 'Отхвърлен',
  Merged: 'Слят',
  Approved: 'Одобрен',
  Hidden: 'Скрит',
  Active: 'Активен',
  Archived: 'Архивиран',
} satisfies Record<CatalogSummary['status'], string>;

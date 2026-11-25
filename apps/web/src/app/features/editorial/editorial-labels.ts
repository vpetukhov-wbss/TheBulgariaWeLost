import type { MaterialDetail } from '../../api/generated/models/material-detail';
import type { MaterialSummary } from '../../api/generated/models/material-summary';

export const materialTypes = {
  Story: 'Разказ',
  Document: 'Документ',
  PhotoEssay: 'Фотоистория',
  Episode: 'Епизод',
} satisfies Record<MaterialDetail['type'], string>;

export const workingStages = {
  Draft: 'Чернова',
  Submitted: 'Чака преглед',
  InReview: 'В преглед',
  ChangesRequested: 'Върнат за корекции',
} satisfies Record<NonNullable<MaterialSummary['workingStatus']>, string>;

export const publicStages = {
  Unpublished: 'Непубликуван',
  Published: 'Публикуван',
  Withdrawn: 'Свален',
  Archived: 'В кошчето',
} satisfies Record<MaterialSummary['status'], string>;

export function isKey<T extends object>(items: T, key: string): key is Extract<keyof T, string> {
  return Object.hasOwn(items, key);
}

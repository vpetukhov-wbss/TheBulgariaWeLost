import type { MaterialSummary } from '../../api/generated/models/material-summary';

const statusLabels = {
  Draft: 'Чернова',
  Submitted: 'Изпратен за преглед',
  InReview: 'В редакция',
  ChangesRequested: 'Върнат за корекции',
  Published: 'Публикуван',
  Unpublished: 'Непубликуван',
  Withdrawn: 'Изтеглен',
  Archived: 'Архивиран',
};

export function authorStatus(item: Pick<MaterialSummary, 'status' | 'workingStatus'>): string {
  return statusLabels[item.workingStatus ?? item.status];
}

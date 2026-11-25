import type { AuditOutcome } from '../../api/generated/models/audit-outcome';
import type { AuditTargetType } from '../../api/generated/models/audit-target-type';

export const auditTargets: Record<AuditTargetType, string> = {
  Account: 'Потребител',
  Catalog: 'Каталог',
  Material: 'Материал',
  Moderation: 'Модерация',
  Other: 'Друго',
};

export const auditOutcomes: Record<AuditOutcome, string> = {
  Succeeded: 'Успешно',
  Failed: 'Неуспешно',
  Denied: 'Отказано',
};

const auditActions: Record<string, string> = {
  AccountProfileUpdated: 'Редакция на профил',
  AccountRoleChanged: 'Промяна на роля',
  AccountSanctionIssued: 'Наложена санкция',
  AccountSanctionRevoked: 'Отменена санкция',
  AccountSessionsRevoked: 'Прекратени сесии',
  AccountPasswordResetRequested: 'Поискано възстановяване на парола',
  AccountPasswordResetDispatched: 'Изпратен линк за възстановяване',
  AccountPasswordResetFailed: 'Неуспешно изпращане на линк',
  CatalogCreated: 'Създаден запис в каталога',
  CatalogUpdated: 'Редактиран запис в каталога',
  MaterialCreated: 'Създаден материал',
  MaterialDraftUpdated: 'Редактирана чернова',
  MaterialSubmitForReview: 'Материалът е изпратен за преглед',
  MaterialStartReview: 'Започнат преглед',
  MaterialPublish: 'Публикуван материал',
  MaterialRevisionRestored: 'Възстановена версия',
};

export const auditFields: Record<string, string> = {
  previousRole: 'Предишна роля',
  role: 'Нова роля',
  sanctionId: 'Санкция',
  moderationCaseId: 'Случай от модерацията',
  sourceId: 'Изходен запис',
  targetId: 'Целеви запис',
  priority: 'Приоритет',
  fields: 'Редактирани полета',
};

export function auditAction(action: string): string {
  return Object.hasOwn(auditActions, action) ? auditActions[action] : action;
}

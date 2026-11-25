import type { AdminUserSummary } from '../../api/generated/models/admin-user-summary';

export const userRoles = {
  User: 'Потребител',
  Editor: 'Редактор',
  Administrator: 'Администратор',
} satisfies Record<AdminUserSummary['role'], string>;

export const userStatuses = {
  Pending: 'Очаква потвърждение',
  Active: 'Активен',
  Disabled: 'Деактивиран',
} satisfies Record<AdminUserSummary['status'], string>;

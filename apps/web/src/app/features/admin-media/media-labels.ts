import type { AdminMediaDetail } from '../../api/generated/models/admin-media-detail';

export const mediaTypes: Record<AdminMediaDetail['type'], string> = {
  Image: 'Изображение',
  Pdf: 'PDF',
  Other: 'Друг файл',
};

export const mediaProcessing: Record<AdminMediaDetail['processingStatus'], string> = {
  Pending: 'В опашката',
  Claimed: 'Обработва се',
  Ready: 'Готов',
  Failed: 'Неуспешна обработка',
};

export const mediaAccess: Record<AdminMediaDetail['accessStatus'], string> = {
  Active: 'Активен',
  Hidden: 'Скрит',
  Restricted: 'Ограничен',
  Removed: 'Премахнат',
};

export const mediaRights: Record<AdminMediaDetail['rightsStatus'], string> = {
  Recorded: 'Въведено основание',
  Missing: 'Липсва основание',
};

export const mediaPurposes: Record<AdminMediaDetail['purpose'], string> = {
  'profile-image': 'Профилно изображение',
  'material-original': 'Материал за архива',
  'source-document': 'Документ източник',
  'advertisement-creative': 'Рекламно изображение',
};

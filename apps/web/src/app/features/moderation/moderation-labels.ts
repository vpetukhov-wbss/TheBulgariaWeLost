import type { ModerationDecision } from '../../api/generated/models/moderation-decision';
import type { ModerationPriority } from '../../api/generated/models/moderation-priority';
import type { ModerationStatus } from '../../api/generated/models/moderation-status';
import type { ModerationType } from '../../api/generated/models/moderation-type';
import type { ReportReason } from '../../api/generated/models/report-reason';

export const reportReasons = {
  Copyright: 'Оспорени авторски права',
  Privacy: 'Лични данни или неприкосновеност',
  Inaccuracy: 'Фактическа неточност',
  Other: 'Друга причина',
} satisfies Record<ReportReason, string>;

export const caseStatuses = {
  Open: 'Нов',
  UnderReview: 'В преглед',
  Resolved: 'Решен',
} satisfies Record<ModerationStatus, string>;

export const casePriorities = {
  High: 'Висок',
  Normal: 'Нормален',
} satisfies Record<ModerationPriority, string>;

export const caseTypes = {
  Rights: 'Права и лични данни',
  Content: 'Съдържание',
} satisfies Record<ModerationType, string>;

export const decisions = {
  Dismiss: 'Приключи без промяна',
  RequestCorrection: 'Поискай корекция',
  WithdrawMaterial: 'Свали материала',
  RestoreMaterial: 'Възстанови публичния достъп',
} satisfies Record<ModerationDecision, string>;

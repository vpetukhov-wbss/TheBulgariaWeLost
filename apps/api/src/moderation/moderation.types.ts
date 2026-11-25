export enum ModerationStatus {
  Open = 'Open',
  UnderReview = 'UnderReview',
  Resolved = 'Resolved',
}

export enum ModerationPriority {
  High = 'High',
  Normal = 'Normal',
}

export enum ModerationType {
  Rights = 'Rights',
  Content = 'Content',
}

export enum ReportReason {
  Copyright = 'Copyright',
  Privacy = 'Privacy',
  Inaccuracy = 'Inaccuracy',
  Other = 'Other',
}

export enum ModerationDecision {
  Dismiss = 'Dismiss',
  RequestCorrection = 'RequestCorrection',
  WithdrawMaterial = 'WithdrawMaterial',
  RestoreMaterial = 'RestoreMaterial',
}

export interface Resolution {
  decision: ModerationDecision;
  reason: string;
  decidedAtUtc: string;
}

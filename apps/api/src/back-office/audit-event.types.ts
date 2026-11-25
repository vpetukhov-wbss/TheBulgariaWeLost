export enum AuditTargetType {
  Account = 'Account',
  Catalog = 'Catalog',
  Material = 'Material',
  Moderation = 'Moderation',
  Other = 'Other',
  SiteSettings = 'SiteSettings',
}

export enum AuditOutcome {
  Succeeded = 'Succeeded',
  Failed = 'Failed',
  Denied = 'Denied',
}

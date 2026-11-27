export enum AuditTargetType {
  Account = 'Account',
  Catalog = 'Catalog',
  Job = 'Job',
  Material = 'Material',
  Media = 'Media',
  Moderation = 'Moderation',
  Other = 'Other',
  SiteSettings = 'SiteSettings',
  StorageLocation = 'StorageLocation',
}

export enum AuditOutcome {
  Succeeded = 'Succeeded',
  Failed = 'Failed',
  Denied = 'Denied',
}

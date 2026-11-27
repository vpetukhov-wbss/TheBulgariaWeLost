export type MediaConfig = {
  backupReportToken: string;
  backupMaxAgeHours: number;
  serviceToken: string;
  uploadGrantSecret: string;
  readGrantSecret: string;
  uploadGrantExpiresSeconds: number;
  uploadLeaseSeconds: number;
  readGrantExpiresSeconds: number;
  inspectionLeaseSeconds: number;
  maxUploadBytes: number;
  accountQuotaBytes: number;
  defaultStorageLocationId: string;
  probeOrigin: string;
  probeToken: string;
};

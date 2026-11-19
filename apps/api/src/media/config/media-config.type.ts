export type MediaConfig = {
  serviceToken: string;
  uploadGrantSecret: string;
  uploadGrantExpiresSeconds: number;
  uploadLeaseSeconds: number;
  maxUploadBytes: number;
  accountQuotaBytes: number;
  defaultStorageLocationId: string;
};

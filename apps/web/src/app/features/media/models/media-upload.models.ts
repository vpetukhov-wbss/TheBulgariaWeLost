import type { MediaAsset } from '../../../api/generated/models/media-asset';

export type MediaUploadStage =
  | 'idle'
  | 'hashing'
  | 'creating-session'
  | 'uploading'
  | 'processing'
  | 'ready'
  | 'restricted'
  | 'failed';

export type RightsBasis = 'own-archive' | 'permission' | 'public-domain' | 'licence';

export interface MediaUploadMetadata {
  alternativeText: string;
  rightsBasis: RightsBasis;
  rightsEvidence: string;
}

export interface MediaPreview {
  asset: MediaAsset;
  contentType: string;
  objectUrl: string;
}

export interface UploadProgress {
  percent: number;
  loaded: number;
  total: number;
}

import { HttpClient, HttpEventType, HttpHeaders, type HttpEvent } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { filter, map, switchMap, take, tap, timeout, timer } from 'rxjs';
import type { Observable } from 'rxjs';
import type { MediaAsset } from '../../../api/generated/models/media-asset';
import type { UploadSession } from '../../../api/generated/models/upload-session';
import { MediaService } from '../../../api/generated/services/media.service';
import type {
  MediaPreview,
  MediaUploadMetadata,
  UploadProgress,
} from '../models/media-upload.models';

const uploadIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const processingTimeoutMs = 65_000;

@Injectable()
export class MediaUploadService {
  private readonly api = inject(MediaService);
  private readonly http = inject(HttpClient);

  async sha256(file: File): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
  }

  createSession(
    file: File,
    sha256: string,
    metadata: MediaUploadMetadata,
  ): Observable<UploadSession> {
    const purpose = file.type === 'application/pdf' ? 'source-document' : 'material-original';
    return this.api.createUploadSession({
      body: {
        purpose,
        length: file.size,
        sha256,
        alternativeText: metadata.alternativeText.trim(),
        rightsEvidence: `${this.rightsLabel(metadata.rightsBasis)}: ${metadata.rightsEvidence.trim()}`,
      },
    });
  }

  upload(
    session: UploadSession,
    file: File,
    onProgress: (progress: UploadProgress) => void,
  ): Observable<void> {
    if (
      !uploadIdPattern.test(session.uploadId) ||
      session.uploadUrl !== `/media/v1/uploads/${session.uploadId}` ||
      !session.grant ||
      session.maxBytes !== file.size
    ) {
      throw new Error('invalid_upload_session');
    }

    return this.http
      .put<void>(session.uploadUrl, file, {
        headers: new HttpHeaders({
          Authorization: `Bearer ${session.grant}`,
          'Content-Type': 'application/octet-stream',
        }),
        observe: 'events',
        reportProgress: true,
      })
      .pipe(
        tap((event) => this.reportProgress(event, file.size, onProgress)),
        filter((event) => event.type === HttpEventType.Response),
        map(() => undefined),
      );
  }

  waitUntilProcessed(
    assetId: string,
    onStatus: (asset: MediaAsset) => void,
  ): Observable<MediaAsset> {
    return timer(0, 1_000).pipe(
      switchMap(() => this.api.getMediaAsset({ assetId })),
      tap(onStatus),
      filter((asset) => asset.processingStatus === 'Ready' || asset.processingStatus === 'Failed'),
      take(1),
      timeout({ first: processingTimeoutMs }),
    );
  }

  loadPreview(asset: MediaAsset): Observable<MediaPreview> {
    const variant = asset.variants.includes('preview') ? 'preview' : 'original';
    return this.api.createMediaReadGrant({ assetId: asset.id, body: { variant } }).pipe(
      switchMap((readGrant) =>
        this.api.readMedia({
          assetId: asset.id,
          variant,
          grant: readGrant.grant,
        }),
      ),
      map((blob) => ({
        asset,
        contentType: blob.type || asset.contentType || 'application/octet-stream',
        objectUrl: URL.createObjectURL(blob),
      })),
    );
  }

  private reportProgress(
    event: HttpEvent<void>,
    fallbackTotal: number,
    callback: (progress: UploadProgress) => void,
  ): void {
    if (event.type === HttpEventType.Sent) {
      callback({ percent: 0, loaded: 0, total: fallbackTotal });
      return;
    }
    if (event.type === HttpEventType.UploadProgress) {
      const total = event.total ?? fallbackTotal;
      callback({
        percent: total ? Math.min(100, Math.round((event.loaded / total) * 100)) : 0,
        loaded: event.loaded,
        total,
      });
      return;
    }
    if (event.type === HttpEventType.Response) {
      callback({ percent: 100, loaded: fallbackTotal, total: fallbackTotal });
    }
  }

  private rightsLabel(value: MediaUploadMetadata['rightsBasis']): string {
    return {
      'own-archive': 'Личен или семеен архив',
      permission: 'Изрично разрешение',
      'public-domain': 'Обществено достояние',
      licence: 'Лицензирано използване',
    }[value];
  }
}

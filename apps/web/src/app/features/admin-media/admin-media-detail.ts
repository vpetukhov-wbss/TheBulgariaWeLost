import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NbAlertModule, NbButtonModule, NbCardModule, NbInputModule } from '@nebular/theme';
import { map, switchMap } from 'rxjs';
import { AdminMediaService } from '../../api/generated/services/admin-media.service';
import type { EditAdminMediaRequest } from '../../api/generated/models/edit-admin-media-request';
import { AdminMediaStore } from './admin-media.store';
import {
  mediaAccess,
  mediaProcessing,
  mediaPurposes,
  mediaRights,
  mediaTypes,
} from './media-labels';

@Component({
  imports: [
    DatePipe,
    DecimalPipe,
    FormsModule,
    RouterLink,
    NbAlertModule,
    NbButtonModule,
    NbCardModule,
    NbInputModule,
  ],
  providers: [AdminMediaStore],
  templateUrl: './admin-media-detail.html',
  styleUrls: ['../editorial/editorial.scss', './admin-media-detail.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminMediaDetail {
  protected readonly store = inject(AdminMediaStore);
  private readonly admin = inject(AdminMediaService);
  private readonly http = inject(HttpClient);
  private readonly params = toSignal(inject(ActivatedRoute).paramMap, { requireSync: true });
  protected readonly id = computed(() => this.params().get('id') ?? '');
  protected readonly asset = computed(() => this.store.record()?.asset);
  protected readonly tab = linkedSignal({
    source: this.id,
    computation: (): 'overview' | 'metadata' | 'access' => 'overview',
  });
  protected readonly types = mediaTypes;
  protected readonly processing = mediaProcessing;
  protected readonly accessStatuses = mediaAccess;
  protected readonly purposes = mediaPurposes;
  protected readonly rights = mediaRights;
  protected readonly restrictionReason = signal('');
  protected readonly draft = linkedSignal(() => {
    const asset = this.asset();
    return {
      creditLine: asset?.creditLine ?? '',
      accessibilityText: asset?.accessibilityText ?? '',
      rightsEvidence: asset?.rightsEvidence ?? '',
      reason: '',
    };
  });
  private attempt?: { version: number; id: string; reason: string; key: string };
  protected readonly previewRequested = linkedSignal({
    source: this.asset,
    computation: () => false,
  });
  protected readonly previewBlob = rxResource({
    params: () => {
      const asset = this.asset();
      return this.previewRequested() && asset?.previewAvailable ? asset.id : undefined;
    },
    stream: ({ params: id }) =>
      this.admin.createAdminMediaPreviewGrant({ id }).pipe(
        switchMap((grant) => {
          const url = '/media/v1/assets/' + id + '/preview';
          if (
            grant.assetId !== id ||
            grant.variant !== 'preview' ||
            grant.url !== url ||
            !grant.grant
          ) {
            throw new Error('Invalid preview grant');
          }
          return this.http.get(url, {
            headers: { Authorization: 'Bearer ' + grant.grant },
            responseType: 'blob',
          });
        }),
        map((blob) => {
          if (!['image/jpeg', 'image/png', 'application/pdf'].includes(blob.type))
            throw new Error('Unsupported preview type');
          return blob;
        }),
      ),
  });
  protected readonly preview = signal<{ url: string; image: boolean } | null>(null);

  constructor() {
    this.store.load(this.id);
    effect((cleanup) => {
      const blob = this.previewBlob.hasValue() ? this.previewBlob.value() : undefined;
      this.preview.set(null);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      this.preview.set({ url, image: blob.type.startsWith('image/') });
      cleanup(() => URL.revokeObjectURL(url));
    });
  }

  protected change(field: keyof EditAdminMediaRequest, value: string): void {
    this.draft.update((draft) => ({ ...draft, [field]: value }));
  }

  protected async save(): Promise<void> {
    const draft = this.draft();
    if (!draft.reason.trim()) return;
    if (await this.store.edit(draft)) this.tab.set('overview');
  }

  protected async changeRestriction(): Promise<void> {
    const asset = this.asset();
    const reason = this.restrictionReason().trim();
    if (!asset?.restrictionAction || !reason) return;
    if (
      this.attempt?.version !== asset.version ||
      this.attempt.id !== asset.id ||
      this.attempt.reason !== reason
    ) {
      this.attempt = { version: asset.version, id: asset.id, reason, key: crypto.randomUUID() };
    }
    if (await this.store.restrict(reason, this.attempt.key)) {
      this.restrictionReason.set('');
      this.attempt = undefined;
      this.tab.set('overview');
    }
  }
}

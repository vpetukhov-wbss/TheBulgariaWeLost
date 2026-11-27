import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  NbAlertModule,
  NbButtonModule,
  NbCardModule,
  NbInputModule,
  NbSpinnerModule,
} from '@nebular/theme';
import type { StorageAssetIssueKind } from '../../api/generated/models/storage-asset-issue-kind';
import type { StorageConnectionStatus } from '../../api/generated/models/storage-connection-status';
import type { StorageLocationStatus } from '../../api/generated/models/storage-location-status';
import type { StorageTransition } from '../../api/generated/models/storage-transition';
import { StorageStore } from './storage.store';

const statusLabels: Record<StorageLocationStatus, string> = {
  Draft: 'Чернова',
  ActiveForNewWrites: 'За нови качвания',
  ReadOnly: 'Само за четене',
  Archived: 'Архивирано',
};
const healthLabels: Record<StorageConnectionStatus, string> = {
  NotChecked: 'Няма проведена проба',
  Healthy: 'Успешна връзка',
  Unavailable: 'Хранилището е недостъпно',
  Denied: 'Отказан достъп',
};
const issueLabels: Record<StorageAssetIssueKind, string> = {
  Missing: 'Липсващ файл',
  FailedUpload: 'Качването е изтекло',
  IntegrityMismatch: 'Несъответствие на целостта',
};

@Component({
  imports: [
    DatePipe,
    DecimalPipe,
    ReactiveFormsModule,
    RouterLink,
    NbAlertModule,
    NbButtonModule,
    NbCardModule,
    NbInputModule,
    NbSpinnerModule,
  ],
  providers: [StorageStore],
  templateUrl: './storage-page.html',
  styleUrls: ['../editorial/editorial.scss', './storage-page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StoragePage {
  protected readonly store = inject(StorageStore);
  private readonly router = inject(Router);
  private readonly params = toSignal(inject(ActivatedRoute).paramMap, { requireSync: true });
  protected readonly id = computed(() => this.params().get('id') ?? '');
  protected readonly filter = signal<StorageLocationStatus | undefined>(undefined);
  protected readonly statusLabels = statusLabels;
  protected readonly healthLabels = healthLabels;
  protected readonly issueLabels = issueLabels;
  protected readonly statuses = Object.keys(statusLabels) as StorageLocationStatus[];
  protected readonly form = signal<'create' | 'edit' | StorageTransition | null>(null);
  protected readonly label = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(100)],
  });
  protected readonly profileId = new FormControl('', { nonNullable: true });
  protected readonly reason = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(500)],
  });

  constructor() {
    effect(() => {
      const id = this.id();
      this.form.set(null);
      untracked(() => this.store.open(id));
    });
  }

  protected refresh(): void {
    this.form.set(null);
    this.filter.set(undefined);
    this.store.open(this.id());
  }

  protected filterBy(value: string): void {
    const status = this.statuses.find((candidate) => candidate === value);
    void this.store.loadLocations(status).then((loaded) => {
      if (loaded) this.filter.set(status);
    });
  }

  protected openForm(form: NonNullable<ReturnType<StoragePage['form']>>): void {
    const location = this.store.detail()?.value;
    this.form.set(form);
    this.label.reset(form === 'edit' ? (location?.label ?? '') : '');
    this.profileId.reset(form === 'edit' ? (location?.profileId ?? '') : '');
    this.reason.reset('');
    if (form === 'create' || (form === 'edit' && location?.status === 'Draft')) {
      void this.store.loadProfiles();
    }
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    const form = this.form();
    const label = this.label.value.trim();
    const profileId = this.profileId.value;
    const reason = this.reason.value.trim();
    if (form === 'create' && label && profileId && this.label.valid) {
      const location = await this.store.create({ label, profileId });
      if (location) await this.router.navigate(['/admin/storage', location.id]);
    } else if (form === 'edit' && label && this.label.valid) {
      const profileChanged = profileId && profileId !== this.store.detail()?.value.profileId;
      if (await this.store.edit({ label, ...(profileChanged ? { profileId } : {}) })) {
        this.form.set(null);
      }
    } else if (
      (form === 'ActivateForNewWrites' || form === 'ArchiveDraft') &&
      reason &&
      this.reason.valid
    ) {
      if (await this.store.transition(form, reason)) this.form.set(null);
    }
  }
}

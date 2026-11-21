import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import type { ElementRef, OnDestroy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  NbAlertModule,
  NbButtonModule,
  NbCardModule,
  NbIconModule,
  NbInputModule,
  NbProgressBarModule,
  NbSelectModule,
  NbSpinnerModule,
} from '@nebular/theme';
import { lastValueFrom } from 'rxjs';
import { problemCode } from '../../../core/auth/auth-errors';
import type { MediaPreview, MediaUploadStage, RightsBasis } from '../models/media-upload.models';
import { MediaUploadService } from '../services/media-upload.service';

const maxUploadBytes = 32 * 1024 * 1024;
const supportedTypes = new Set(['image/jpeg', 'image/png', 'application/pdf']);

@Component({
  selector: 'app-media-upload-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NbAlertModule,
    NbButtonModule,
    NbCardModule,
    NbIconModule,
    NbInputModule,
    NbProgressBarModule,
    NbSelectModule,
    NbSpinnerModule,
  ],
  providers: [MediaUploadService],
  templateUrl: './media-upload-page.html',
  styleUrl: './media-upload-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MediaUploadPage implements OnDestroy {
  @ViewChild('fileInput') private fileInput?: ElementRef<HTMLInputElement>;

  private readonly builder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly media = inject(MediaUploadService);
  private destroyed = false;

  protected readonly form = this.builder.nonNullable.group({
    alternativeText: [
      '',
      [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(500),
        Validators.pattern(/\S/),
      ],
    ],
    rightsBasis: this.builder.nonNullable.control<RightsBasis>('own-archive', Validators.required),
    rightsEvidence: [
      '',
      [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(2_000),
        Validators.pattern(/\S/),
      ],
    ],
  });
  protected readonly file = signal<File | null>(null);
  protected readonly stage = signal<MediaUploadStage>('idle');
  protected readonly uploadPercent = signal(0);
  protected readonly processingStatus = signal<string | null>(null);
  protected readonly message = signal('');
  protected readonly preview = signal<MediaPreview | null>(null);
  protected readonly isBusy = computed(() =>
    ['hashing', 'creating-session', 'uploading', 'processing'].includes(this.stage()),
  );

  protected canSubmit(): boolean {
    return Boolean(this.file()) && this.form.valid && !this.isBusy();
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const selected = input.files?.item(0) ?? null;
    this.clearPreview();
    this.message.set('');
    this.processingStatus.set(null);
    this.uploadPercent.set(0);

    if (!selected) {
      this.file.set(null);
      this.stage.set('idle');
      return;
    }
    if (!supportedTypes.has(selected.type)) {
      this.file.set(null);
      input.value = '';
      this.fail('Поддържат се JPEG, PNG и PDF файлове.');
      return;
    }
    if (selected.size <= 0 || selected.size > maxUploadBytes) {
      this.file.set(null);
      input.value = '';
      this.fail('Файлът трябва да е до 32 MB и да не е празен.');
      return;
    }

    this.file.set(selected);
    this.stage.set('idle');
  }

  protected async startUpload(): Promise<void> {
    const selected = this.file();
    if (!selected || this.isBusy()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.clearPreview();
    this.message.set('');
    this.processingStatus.set(null);
    this.uploadPercent.set(0);

    try {
      this.stage.set('hashing');
      const checksum = await this.media.sha256(selected);
      if (this.destroyed) return;

      this.stage.set('creating-session');
      const session = await lastValueFrom(
        this.media
          .createSession(selected, checksum, this.form.getRawValue())
          .pipe(takeUntilDestroyed(this.destroyRef)),
      );
      if (this.destroyed) return;

      this.stage.set('uploading');
      await lastValueFrom(
        this.media
          .upload(session, selected, (progress) => this.uploadPercent.set(progress.percent))
          .pipe(takeUntilDestroyed(this.destroyRef)),
      );
      if (this.destroyed) return;

      this.stage.set('processing');
      const asset = await lastValueFrom(
        this.media
          .waitUntilProcessed(session.uploadId, (current) =>
            this.processingStatus.set(current.processingStatus),
          )
          .pipe(takeUntilDestroyed(this.destroyRef)),
      );
      if (asset.processingStatus === 'Failed') {
        this.fail('Файлът не премина проверката. Опитай отново или избери друг файл.');
        return;
      }

      const preview = await lastValueFrom(
        this.media.loadPreview(asset).pipe(takeUntilDestroyed(this.destroyRef)),
      );
      if (this.destroyed) {
        URL.revokeObjectURL(preview.objectUrl);
        return;
      }
      this.preview.set(preview);
      this.stage.set('ready');
      this.message.set('Файлът е качен, проверен и готов за защитен преглед.');
    } catch (error: unknown) {
      if (this.destroyed) return;
      this.handleFailure(error);
    }
  }

  protected replaceFile(): void {
    this.clearPreview();
    this.file.set(null);
    this.stage.set('idle');
    this.message.set('');
    this.processingStatus.set(null);
    this.uploadPercent.set(0);
    if (this.fileInput) {
      this.fileInput.nativeElement.value = '';
      this.fileInput.nativeElement.focus();
    }
  }

  protected fileSize(): string {
    const size = this.file()?.size ?? 0;
    if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  protected isImagePreview(): boolean {
    return this.preview()?.contentType.startsWith('image/') ?? false;
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clearPreview();
  }

  private handleFailure(error: unknown): void {
    if (error instanceof HttpErrorResponse) {
      const code = problemCode(error);
      if (
        error.status === 403 &&
        [
          'media_access_revoked',
          'media_access_restricted',
          'media_access_hidden',
          'media_access_removed',
        ].includes(code ?? '')
      ) {
        this.stage.set('restricted');
        this.message.set(
          'Правата за този файл са ограничени. Прегледът е скрит и е нужна редакторска проверка.',
        );
        return;
      }
      const known: Record<string, string> = {
        upload_too_large: 'Файлът надвишава разрешения размер.',
        upload_quota_exceeded: 'Няма достатъчно свободна квота за този файл.',
        unsupported_media_format: 'Съдържанието не е валидна JPEG, PNG снимка или PDF.',
        upload_integrity_mismatch: 'Файлът се промени по време на качването. Опитай отново.',
        upload_session_revoked: 'Сесията е прекратена. Влез отново и повтори качването.',
        storage_unavailable: 'Файловото хранилище е временно недостъпно.',
        media_busy: 'Обработката е заета. Изчакай и опитай отново.',
      };
      this.fail((code && known[code]) || 'Качването не завърши. Опитай отново.');
      return;
    }
    this.fail(
      error instanceof Error && error.name === 'TimeoutError'
        ? 'Обработката отнема повече време. Опитай отново след малко.'
        : 'Качването не завърши. Опитай отново.',
    );
  }

  private fail(message: string): void {
    this.stage.set('failed');
    this.message.set(message);
  }

  private clearPreview(): void {
    const current = this.preview();
    if (current) URL.revokeObjectURL(current.objectUrl);
    this.preview.set(null);
  }
}

import { KeyValuePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NbAlertModule, NbButtonModule, NbInputModule } from '@nebular/theme';
import { firstValueFrom } from 'rxjs';
import type { CreateModerationReportRequest } from '../../api/generated/models/create-moderation-report-request';
import type { ReportReason } from '../../api/generated/models/report-reason';
import { ModerationService } from '../../api/generated/services/moderation.service';
import { actionError } from '../../core/auth/auth-errors';
import { reportReasons } from './moderation-labels';

@Component({
  selector: 'app-material-report-form',
  imports: [KeyValuePipe, ReactiveFormsModule, NbAlertModule, NbButtonModule, NbInputModule],
  templateUrl: './material-report-form.html',
  styleUrl: '../editorial/editorial.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaterialReportForm {
  private readonly api = inject(ModerationService);
  private readonly builder = inject(FormBuilder).nonNullable;
  readonly slug = input.required<string>();
  protected readonly open = signal(false);
  protected readonly busy = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal('');
  protected readonly reasons = reportReasons;
  private pending?: { signature: string; key: string };

  protected readonly form = this.builder.group({
    reasonCode: this.builder.control<ReportReason | ''>('', Validators.required),
    description: ['', Validators.maxLength(1500)],
    evidenceUrl: ['', [Validators.maxLength(1500), Validators.pattern(/^https?:\/\/\S+$/i)]],
  });

  protected async send(): Promise<void> {
    if (this.busy() || this.sent()) return;
    const value = this.form.getRawValue();
    if (this.form.invalid || !value.reasonCode) {
      this.error.set('Избери причина. За източник използвай пълен HTTP или HTTPS адрес.');
      return;
    }
    const slug = this.slug();
    const description = value.description.trim();
    const evidenceUrl = value.evidenceUrl.trim();
    const body: CreateModerationReportRequest = {
      reasonCode: value.reasonCode,
      ...(description ? { description } : {}),
      ...(evidenceUrl ? { evidenceUrl } : {}),
    };
    const signature = JSON.stringify([slug, body]);
    if (this.pending?.signature !== signature)
      this.pending = { signature, key: crypto.randomUUID() };
    this.error.set('');
    this.busy.set(true);
    try {
      await firstValueFrom(
        this.api.submitModerationReport({ slug, 'Idempotency-Key': this.pending.key, body }),
      );
      this.sent.set(true);
      this.open.set(false);
      this.form.reset();
      this.pending = undefined;
    } catch (error: unknown) {
      this.error.set(
        error instanceof HttpErrorResponse && error.status === 429
          ? 'Изчакай малко, преди да опиташ отново.'
          : actionError(error, 'Сигналът не можа да се подаде. Провери данните и опитай отново.'),
      );
    } finally {
      this.busy.set(false);
    }
  }
}

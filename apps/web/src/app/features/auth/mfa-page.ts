import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import type { OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NbTokenService } from '@nebular/auth';
import {
  NbAlertModule,
  NbButtonModule,
  NbCardModule,
  NbInputModule,
  NbSpinnerModule,
} from '@nebular/theme';
import { firstValueFrom } from 'rxjs';
import type { MfaEnrollment } from '../../api/generated/models/mfa-enrollment';
import { AuthService } from '../../api/generated/services/auth.service';
import { actionError, isServiceUnavailable, isSessionExpired } from '../../core/auth/auth-errors';
import { safeReturnTo } from '../../core/auth/auth-navigation';

type MfaStage =
  | 'loading'
  | 'enroll'
  | 'confirm'
  | 'verify'
  | 'recovery-codes'
  | 'expired'
  | 'forbidden'
  | 'unavailable';

@Component({
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NbAlertModule,
    NbButtonModule,
    NbCardModule,
    NbInputModule,
    NbSpinnerModule,
  ],
  templateUrl: './mfa-page.html',
  styleUrl: './mfa-page.scss',
})
export class MfaPage implements OnInit {
  private readonly api = inject(AuthService);
  private readonly tokens = inject(NbTokenService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly builder = inject(FormBuilder).nonNullable;

  protected readonly stage = signal<MfaStage>('loading');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly enrollment = signal<MfaEnrollment | null>(null);
  protected readonly recoveryCodes = signal<string[]>([]);
  protected readonly useRecoveryCode = signal(false);
  protected readonly returnTo = safeReturnTo(
    this.route.snapshot.queryParamMap.get('returnTo'),
    '/admin',
  );

  protected readonly passwordForm = this.builder.group({
    currentPassword: ['', Validators.required],
  });
  protected readonly codeForm = this.builder.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });
  protected readonly recoveryForm = this.builder.group({
    recoveryCode: [
      '',
      [Validators.required, Validators.pattern(/^[A-Z2-7]{4}(?:-[A-Z2-7]{4}){3}$/)],
    ],
  });

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.stage.set('loading');
    this.error.set('');
    try {
      const profile = await firstValueFrom(this.api.getProfile());
      if (profile.role !== 'Administrator') {
        this.stage.set('forbidden');
        return;
      }
      this.stage.set(profile.mfaEnabled ? 'verify' : 'enroll');
    } catch (error: unknown) {
      await this.handleError(error, 'MFA настройките не могат да бъдат заредени.');
    }
  }

  protected async startEnrollment(): Promise<void> {
    this.passwordForm.markAllAsTouched();
    if (this.passwordForm.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      this.enrollment.set(
        await firstValueFrom(
          this.api.startMfaEnrollment({ body: this.passwordForm.getRawValue() }),
        ),
      );
      this.stage.set('confirm');
    } catch (error: unknown) {
      await this.handleError(error, 'Текущата парола е невалидна или настройката не успя.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async confirmEnrollment(): Promise<void> {
    this.codeForm.markAllAsTouched();
    if (this.codeForm.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const result = await firstValueFrom(
        this.api.confirmMfaEnrollment({ body: this.codeForm.getRawValue() }),
      );
      this.recoveryCodes.set(result.recoveryCodes);
      this.stage.set('recovery-codes');
    } catch (error: unknown) {
      await this.handleError(
        error,
        'Кодът не е валиден. Провери часа на устройството и опитай пак.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected async verify(): Promise<void> {
    if (this.useRecoveryCode()) {
      await this.verifyRecoveryCode();
      return;
    }
    this.codeForm.markAllAsTouched();
    if (this.codeForm.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await firstValueFrom(this.api.verifyMfa({ body: this.codeForm.getRawValue() }));
      await this.router.navigateByUrl(this.returnTo);
    } catch (error: unknown) {
      await this.handleError(error, 'Кодът е невалиден или вече е използван.');
    } finally {
      this.busy.set(false);
    }
  }

  protected toggleRecovery(): void {
    this.error.set('');
    this.useRecoveryCode.update((value) => !value);
  }

  protected continueAfterEnrollment(): Promise<boolean> {
    return this.router.navigateByUrl(this.returnTo);
  }

  private async verifyRecoveryCode(): Promise<void> {
    this.recoveryForm.markAllAsTouched();
    if (this.recoveryForm.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await firstValueFrom(this.api.recoverMfa({ body: this.recoveryForm.getRawValue() }));
      await this.router.navigateByUrl(this.returnTo);
    } catch (error: unknown) {
      await this.handleError(error, 'Резервният код е невалиден или вече е използван.');
    } finally {
      this.busy.set(false);
    }
  }

  private async handleError(error: unknown, fallback: string): Promise<void> {
    if (isSessionExpired(error)) {
      await firstValueFrom(this.tokens.clear());
      this.stage.set('expired');
      return;
    }
    if (error instanceof HttpErrorResponse && error.status === 403) {
      this.stage.set('forbidden');
      return;
    }
    if (isServiceUnavailable(error)) {
      this.stage.set('unavailable');
      return;
    }
    this.error.set(actionError(error, fallback));
  }
}

import { Component, inject, signal } from '@angular/core';
import type { OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NbTokenService } from '@nebular/auth';
import {
  NbAlertModule,
  NbButtonModule,
  NbCardModule,
  NbInputModule,
  NbSpinnerModule,
} from '@nebular/theme';
import { firstValueFrom } from 'rxjs';
import type { Profile } from '../../api/generated/models/profile';
import { AuthService } from '../../api/generated/services/auth.service';
import { actionError, isSessionExpired } from '../../core/auth/auth-errors';

type AccountState = 'loading' | 'ready' | 'expired' | 'unavailable';

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
  templateUrl: './account.html',
  styleUrl: './account.scss',
})
export class Account implements OnInit {
  private readonly api = inject(AuthService);
  private readonly tokens = inject(NbTokenService);
  private readonly router = inject(Router);
  private readonly builder = inject(FormBuilder).nonNullable;

  protected readonly state = signal<AccountState>('loading');
  protected readonly profile = signal<Profile | null>(null);
  protected readonly saving = signal(false);
  protected readonly endingSessions = signal(false);
  protected readonly success = signal('');
  protected readonly error = signal('');

  protected readonly form = this.builder.group({
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    oldPassword: [''],
    password: ['', Validators.minLength(6)],
    confirmation: [''],
  });

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    this.error.set('');
    try {
      const profile = await firstValueFrom(this.api.getProfile());
      this.profile.set(profile);
      this.form.reset({
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: profile.email,
        oldPassword: '',
        password: '',
        confirmation: '',
      });
      this.state.set('ready');
    } catch (error: unknown) {
      await this.handleLoadError(error);
    }
  }

  protected async save(): Promise<void> {
    if (this.saving()) return;
    this.form.markAllAsTouched();
    this.error.set('');
    this.success.set('');
    if (this.form.invalid) return;

    const value = this.form.getRawValue();
    if (value.password !== value.confirmation) {
      this.error.set('Двете нови пароли трябва да съвпадат.');
      return;
    }

    this.saving.set(true);
    try {
      const updated = await firstValueFrom(
        this.api.updateProfile({
          body: {
            firstName: value.firstName,
            lastName: value.lastName,
            email: value.email,
            ...(value.oldPassword ? { oldPassword: value.oldPassword } : {}),
            ...(value.password ? { password: value.password } : {}),
          },
        }),
      );
      this.profile.set(updated);
      this.form.patchValue({ oldPassword: '', password: '', confirmation: '' });
      this.form.markAsPristine();
      this.success.set(
        updated.email === value.email
          ? 'Профилът е запазен.'
          : 'Промените са запазени. Провери новия имейл за потвърждение.',
      );
    } catch (error: unknown) {
      if (isSessionExpired(error)) {
        await this.expireSession();
      } else {
        this.error.set(
          actionError(
            error,
            'Профилът не беше запазен. За промяна на имейл или парола въведи текущата парола.',
          ),
        );
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected async logoutEverywhere(): Promise<void> {
    if (this.endingSessions()) return;
    this.endingSessions.set(true);
    this.error.set('');
    try {
      await firstValueFrom(this.api.logoutAll());
      await firstValueFrom(this.tokens.clear());
      await this.router.navigate(['/login'], { queryParams: { sessionsEnded: '1' } });
    } catch (error: unknown) {
      if (isSessionExpired(error)) {
        await this.expireSession();
      } else {
        this.error.set(actionError(error, 'Сесиите не бяха прекратени. Опитай отново.'));
      }
    } finally {
      this.endingSessions.set(false);
    }
  }

  private async handleLoadError(error: unknown): Promise<void> {
    if (isSessionExpired(error)) {
      await this.expireSession();
      return;
    }
    this.state.set('unavailable');
  }

  private async expireSession(): Promise<void> {
    await firstValueFrom(this.tokens.clear());
    this.state.set('expired');
  }
}

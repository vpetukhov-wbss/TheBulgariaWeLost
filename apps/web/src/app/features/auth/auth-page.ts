import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NbAuthService } from '@nebular/auth';
import {
  NbAlertModule,
  NbButtonModule,
  NbCardModule,
  NbInputModule,
  NbSpinnerModule,
} from '@nebular/theme';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../api/generated/services/auth.service';
import { actionError } from '../../core/auth/auth-errors';
import { AUTH_STRATEGY } from '../../core/auth/auth.config';
import { safeReturnTo } from '../../core/auth/auth-navigation';

const pages = {
  login: { title: 'Вход', submit: 'Влез' },
  register: { title: 'Създай профил', submit: 'Регистрирай се' },
  forgot: { title: 'Забравена парола', submit: 'Изпрати линк' },
  reset: { title: 'Задай нова парола', submit: 'Запази паролата' },
  confirm: { title: 'Потвърди имейла си', submit: 'Потвърди имейла' },
  'confirm-new': { title: 'Потвърди новия си имейл', submit: 'Потвърди имейла' },
} as const;

type AuthAction = keyof typeof pages;

function isAuthAction(value: unknown): value is AuthAction {
  return typeof value === 'string' && Object.hasOwn(pages, value);
}

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
  templateUrl: './auth-page.html',
  styleUrl: './auth-page.scss',
})
export class AuthPage {
  private readonly auth = inject(NbAuthService);
  private readonly api = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly builder = inject(FormBuilder).nonNullable;

  protected readonly action = this.readAction();
  protected readonly page = pages[this.action];
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly success = signal('');
  protected readonly hash = this.route.snapshot.queryParamMap.get('hash');
  protected readonly information = this.route.snapshot.queryParamMap.has('sessionsEnded')
    ? 'Всички сесии бяха прекратени успешно.'
    : '';
  protected readonly usesLink = ['reset', 'confirm', 'confirm-new'].includes(this.action);

  protected readonly form = this.builder.group({
    email: this.builder.control(
      { value: '', disabled: !['login', 'register', 'forgot'].includes(this.action) },
      [Validators.required, Validators.email],
    ),
    firstName: this.builder.control(
      { value: '', disabled: this.action !== 'register' },
      Validators.required,
    ),
    lastName: this.builder.control(
      { value: '', disabled: this.action !== 'register' },
      Validators.required,
    ),
    password: this.builder.control(
      { value: '', disabled: !['login', 'register', 'reset'].includes(this.action) },
      this.action === 'login'
        ? [Validators.required]
        : [Validators.required, Validators.minLength(6)],
    ),
    confirmation: this.builder.control(
      { value: '', disabled: this.action !== 'reset' },
      Validators.required,
    ),
  });

  protected async submit(): Promise<void> {
    if (this.busy() || this.success() || (this.usesLink && !this.hash)) return;
    this.error.set('');
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const { email, firstName, lastName, password, confirmation } = this.form.getRawValue();
    if (this.action === 'reset' && password !== confirmation) {
      this.error.set('Двете пароли трябва да съвпадат.');
      return;
    }

    this.busy.set(true);
    try {
      switch (this.action) {
        case 'login': {
          const result = await firstValueFrom(
            this.auth.authenticate(AUTH_STRATEGY, { email, password }),
          );
          if (!result.isSuccess()) {
            this.error.set(
              actionError(
                result.getResponse(),
                'Входът е неуспешен. Провери данните си и опитай отново.',
              ),
            );
            return;
          }
          await this.router.navigateByUrl(
            safeReturnTo(this.route.snapshot.queryParamMap.get('returnTo')),
          );
          break;
        }
        case 'register': {
          const result = await firstValueFrom(
            this.auth.register(AUTH_STRATEGY, { email, firstName, lastName, password }),
          );
          if (result.isSuccess()) {
            this.success.set('Провери имейла си за линк за активиране на профила.');
          } else {
            this.error.set(
              actionError(
                result.getResponse(),
                'Регистрацията е неуспешна. Провери данните си и опитай отново.',
              ),
            );
          }
          break;
        }
        case 'forgot': {
          const result = await firstValueFrom(this.auth.requestPassword(AUTH_STRATEGY, { email }));
          const response: unknown = result.getResponse();
          if (
            result.isSuccess() ||
            (response instanceof HttpErrorResponse && response.status === 422)
          ) {
            this.success.set('Ако имейлът е свързан с профил, ще получиш линк за нова парола.');
          } else {
            this.error.set(actionError(response, 'Заявката не успя. Опитай отново.'));
          }
          break;
        }
        case 'reset': {
          const result = await firstValueFrom(this.auth.resetPassword(AUTH_STRATEGY, { password }));
          if (result.isSuccess()) {
            this.success.set('Паролата е сменена. Можеш да влезеш с новата парола.');
          } else {
            this.error.set(
              actionError(
                result.getResponse(),
                'Паролата не беше сменена. Поискай нов линк и опитай отново.',
              ),
            );
          }
          break;
        }
        case 'confirm':
        case 'confirm-new': {
          if (this.action === 'confirm') {
            await firstValueFrom(this.api.confirmEmail({ body: { hash: this.hash! } }));
          } else {
            await firstValueFrom(this.api.confirmNewEmail({ body: { hash: this.hash! } }));
          }
          this.success.set('Имейлът е потвърден. Можеш да влезеш в профила си.');
          break;
        }
      }
    } catch (error: unknown) {
      this.error.set(
        this.usesLink &&
          error instanceof HttpErrorResponse &&
          [400, 401, 404, 422].includes(error.status)
          ? 'Линкът е невалиден или е изтекъл.'
          : actionError(error, 'Възникна проблем. Опитай отново.'),
      );
    } finally {
      this.busy.set(false);
    }
  }

  private readAction(): AuthAction {
    const action: unknown = this.route.snapshot.data['action'];
    if (!isAuthAction(action)) throw new Error('Invalid authentication route.');
    return action;
  }
}

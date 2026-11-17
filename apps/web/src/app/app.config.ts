import {
  HTTP_INTERCEPTORS,
  provideHttpClient,
  withInterceptors,
  withInterceptorsFromDi,
} from '@angular/common/http';
import {
  ApplicationConfig,
  importProvidersFrom,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import {
  NB_AUTH_TOKEN_INTERCEPTOR_FILTER,
  NbAuthJWTInterceptor,
  NbAuthModule,
  NbAuthService,
  NbTokenStorage,
} from '@nebular/auth';
import { NbRoleProvider, NbSecurityModule } from '@nebular/security';
import { NbThemeModule, NbToastrModule } from '@nebular/theme';
import { routes } from './app.routes';
import { emailStrategy, skipBearer } from './core/auth/auth.config';
import { brocodersRefreshInterceptor } from './core/auth/auth-refresh.interceptor';
import { ArchiveAuthService } from './core/auth/auth.service';
import { MemoryTokenStorage } from './core/auth/auth-token.storage';
import { ArchiveRoleProvider } from './core/auth/role.provider';
import { correlationIdInterceptor } from './core/http/correlation-id.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection(),
    provideRouter(routes),
    provideHttpClient(
      withInterceptors([correlationIdInterceptor, brocodersRefreshInterceptor]),
      withInterceptorsFromDi(),
    ),
    importProvidersFrom(
      NbThemeModule.forRoot({ name: 'default' }),
      NbToastrModule.forRoot(),
      NbAuthModule.forRoot({ strategies: [emailStrategy] }),
      NbSecurityModule.forRoot({
        accessControl: {
          Guest: { 'sign-in': 'session' },
          User: { view: 'account' },
          Editor: { parent: 'User', view: 'back-office' },
          Administrator: { parent: 'Editor' },
        },
      }),
    ),
    { provide: NbAuthService, useClass: ArchiveAuthService },
    { provide: NbTokenStorage, useClass: MemoryTokenStorage },
    { provide: NbRoleProvider, useClass: ArchiveRoleProvider },
    { provide: NB_AUTH_TOKEN_INTERCEPTOR_FILTER, useValue: skipBearer },
    { provide: HTTP_INTERCEPTORS, useClass: NbAuthJWTInterceptor, multi: true },
  ],
};

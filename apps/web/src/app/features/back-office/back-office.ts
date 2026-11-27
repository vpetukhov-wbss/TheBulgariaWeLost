import { AsyncPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NbAlertModule, NbButtonModule, NbCardModule, NbSpinnerModule } from '@nebular/theme';
import { catchError, map, of } from 'rxjs';
import type { BackOfficePrincipal } from '../../api/generated/models/back-office-principal';
import { BackOfficeService } from '../../api/generated/services/back-office.service';
import { problemCode } from '../../core/auth/auth-errors';
import { DashboardOverview } from './dashboard-overview';

const roleNames = { Editor: 'Редактор', Administrator: 'Администратор' };

function hasBackOfficeAccess(
  principal: BackOfficePrincipal | null,
): principal is BackOfficePrincipal {
  if (!principal || typeof principal.displayName !== 'string') return false;
  if (!Array.isArray(principal.permissions) || !principal.permissions.includes('BackOffice.Access'))
    return false;
  if (principal.role === 'Editor') return true;
  if (principal.role !== 'Administrator' || !principal.mfaVerifiedAtUtc) return false;
  return Number.isFinite(Date.parse(principal.mfaVerifiedAtUtc));
}

@Component({
  imports: [
    AsyncPipe,
    RouterLink,
    NbAlertModule,
    NbButtonModule,
    NbCardModule,
    NbSpinnerModule,
    DashboardOverview,
  ],
  template: `
    <nb-card>
      <nb-card-header><h1>Работен панел</h1></nb-card-header>
      <nb-card-body>
        @if (access$ | async; as state) {
          @switch (state.kind) {
            @case ('allowed') {
              <p>{{ state.principal.displayName }} · {{ roles[state.principal.role] }}</p>
              <nav aria-label="Редакция">
                <a
                  nbButton
                  status="primary"
                  routerLink="/admin/materials"
                  [queryParams]="{ stage: 'Submitted' }"
                  >Редакторска опашка</a
                >
                <a nbButton outline routerLink="/admin/catalog/topics">Архивен каталог</a>
                <a nbButton outline routerLink="/admin/moderation">Сигнали за съдържание</a>
                @if (state.principal.permissions.includes('Editorial.Manage')) {
                  <a nbButton outline routerLink="/admin/media">Медии</a>
                }
              </nav>
              @if (
                state.principal.permissions.includes('Users.Manage') ||
                state.principal.permissions.includes('Audit.Read') ||
                state.principal.permissions.includes('Storage.Manage') ||
                state.principal.permissions.includes('Operations.Manage') ||
                state.principal.permissions.includes('SiteSettings.Manage')
              ) {
                <nav aria-label="Управление">
                  @if (state.principal.permissions.includes('Users.Manage')) {
                    <a nbButton outline routerLink="/admin/users">Потребители</a>
                  }
                  @if (state.principal.permissions.includes('Audit.Read')) {
                    <a nbButton outline routerLink="/admin/audit">Одитен журнал</a>
                  }
                  @if (state.principal.permissions.includes('Storage.Manage')) {
                    <a nbButton outline routerLink="/admin/storage">Файлови хранилища</a>
                  }
                  @if (state.principal.permissions.includes('Operations.Manage')) {
                    <a nbButton outline routerLink="/admin/operations">Задачи и бекъпи</a>
                  }
                  @if (state.principal.permissions.includes('SiteSettings.Manage')) {
                    <a nbButton outline routerLink="/admin/settings">Настройки на сайта</a>
                  }
                </nav>
              }
              <app-dashboard-overview />
            }
            @case ('signed-out') {
              <nb-alert status="warning" role="alert">Сесията е изтекла. Влез отново.</nb-alert>
              <a
                nbButton
                status="primary"
                routerLink="/login"
                [queryParams]="{ returnTo: '/admin' }"
              >
                Към входа
              </a>
            }
            @case ('forbidden') {
              <nb-alert status="warning" role="alert"
                >Тази сесия няма достъп до работния панел.</nb-alert
              >
              <a nbButton status="basic" routerLink="/">Към началната страница</a>
            }
            @case ('mfa-required') {
              <nb-alert status="warning" role="alert">
                За администраторския панел е нужно актуално MFA потвърждение.
              </nb-alert>
              <a nbButton status="primary" routerLink="/mfa" [queryParams]="{ returnTo: '/admin' }">
                Потвърди MFA
              </a>
            }
            @default {
              <nb-alert status="danger" role="alert"
                >Работният панел е временно недостъпен.</nb-alert
              >
            }
          }
        } @else {
          <p role="status" [nbSpinner]="true">Проверява се достъпът…</p>
        }
      </nb-card-body>
    </nb-card>
  `,
  styles: [
    'nb-card { max-width: 68rem; margin: 1rem auto; } h1 { margin: 0; font-size: 1.5rem; } nav { display: flex; flex-wrap: wrap; gap: .65rem; margin-block: 1rem; }',
  ],
})
export class BackOffice {
  protected readonly roles = roleNames;
  protected readonly access$ = inject(BackOfficeService)
    .getBackOfficePrincipal()
    .pipe(
      map((principal) =>
        hasBackOfficeAccess(principal)
          ? { kind: 'allowed' as const, principal }
          : { kind: 'forbidden' as const },
      ),
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse) {
          if (error.status === 401) return of({ kind: 'signed-out' as const });
          if (error.status === 403) {
            return of({
              kind:
                problemCode(error) === 'mfa_required'
                  ? ('mfa-required' as const)
                  : ('forbidden' as const),
            });
          }
        }
        return of({ kind: 'unavailable' as const });
      }),
    );
}

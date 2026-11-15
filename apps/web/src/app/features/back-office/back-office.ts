import { AsyncPipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NbAlertModule, NbButtonModule, NbCardModule, NbSpinnerModule } from '@nebular/theme';
import { catchError, map, of } from 'rxjs';
import { BACK_OFFICE_SESSION_URL } from '../../core/auth/auth.config';

interface BackOfficePrincipal {
  id: string;
  displayName: string;
  role: 'Editor' | 'Administrator';
  permissions: string[];
  mfaVerifiedAtUtc?: string;
}

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
  imports: [AsyncPipe, RouterLink, NbAlertModule, NbButtonModule, NbCardModule, NbSpinnerModule],
  template: `
    <nb-card>
      <nb-card-header><h1>Работен панел</h1></nb-card-header>
      <nb-card-body>
        @if (access$ | async; as state) {
          @switch (state.kind) {
            @case ('allowed') {
              <p>{{ state.principal.displayName }} · {{ roles[state.principal.role] }}</p>
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
  styles: ['h1 { margin: 0; font-size: 1.5rem; }'],
})
export class BackOffice {
  protected readonly roles = roleNames;
  protected readonly access$ = inject(HttpClient)
    .get<BackOfficePrincipal | null>(BACK_OFFICE_SESSION_URL)
    .pipe(
      map((principal) =>
        hasBackOfficeAccess(principal)
          ? { kind: 'allowed' as const, principal }
          : { kind: 'forbidden' as const },
      ),
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse) {
          if (error.status === 401) return of({ kind: 'signed-out' as const });
          if (error.status === 403) return of({ kind: 'forbidden' as const });
        }
        return of({ kind: 'unavailable' as const });
      }),
    );
}

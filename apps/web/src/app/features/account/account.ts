import { AsyncPipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NbAlertModule, NbButtonModule, NbCardModule, NbSpinnerModule } from '@nebular/theme';
import { catchError, map, of } from 'rxjs';
import { AUTH_API } from '../../core/auth/auth.config';

interface Profile {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

@Component({
  imports: [AsyncPipe, RouterLink, NbAlertModule, NbButtonModule, NbCardModule, NbSpinnerModule],
  template: `
    <nb-card>
      <nb-card-header><h1>Моят профил</h1></nb-card-header>
      <nb-card-body>
        @if (profile$ | async; as state) {
          @if (state.kind === 'ready') {
            <dl>
              <dt>Име</dt>
              <dd>{{ state.profile.firstName }} {{ state.profile.lastName }}</dd>
              <dt>Имейл</dt>
              <dd>{{ state.profile.email || 'Няма въведен имейл' }}</dd>
            </dl>
          } @else if (state.kind === 'signed-out') {
            <nb-alert status="warning" role="alert">Сесията е изтекла. Влез отново.</nb-alert>
            <a nbButton status="primary" routerLink="/login">Към входа</a>
          } @else {
            <nb-alert status="danger" role="alert">Профилът е временно недостъпен.</nb-alert>
          }
        } @else {
          <p role="status" [nbSpinner]="true">Зарежда се профилът…</p>
        }
      </nb-card-body>
    </nb-card>
  `,
  styles: ['h1 { margin: 0; font-size: 1.5rem; } dd { margin: 0 0 1rem; }'],
})
export class Account {
  protected readonly profile$ = inject(HttpClient)
    .get<Profile | null>(AUTH_API + 'me')
    .pipe(
      map((profile) =>
        profile ? { kind: 'ready' as const, profile } : { kind: 'signed-out' as const },
      ),
      catchError((error: unknown) =>
        of({
          kind:
            error instanceof HttpErrorResponse && error.status === 401
              ? ('signed-out' as const)
              : ('unavailable' as const),
        }),
      ),
    );
}

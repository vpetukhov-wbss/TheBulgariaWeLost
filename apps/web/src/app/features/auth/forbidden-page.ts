import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NbAlertModule, NbButtonModule, NbCardModule } from '@nebular/theme';

@Component({
  imports: [RouterLink, NbAlertModule, NbButtonModule, NbCardModule],
  template: `
    <nb-card>
      <nb-card-header><h1>Ограничен достъп</h1></nb-card-header>
      <nb-card-body>
        <nb-alert status="warning" role="alert">
          Текущият ти профил няма право да отваря този раздел.
        </nb-alert>
        <a nbButton status="primary" routerLink="/account">Към профила</a>
      </nb-card-body>
    </nb-card>
  `,
  styles: ['nb-card { max-width: 38rem; margin: 1rem auto; } h1 { margin: 0; font-size: 1.5rem; }'],
})
export class ForbiddenPage {}

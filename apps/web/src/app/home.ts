import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NbSecurityModule } from '@nebular/security';
import { NbButtonModule, NbCardModule } from '@nebular/theme';

@Component({
  imports: [RouterLink, NbButtonModule, NbCardModule, NbSecurityModule],
  template: `
    <nb-card>
      <nb-card-body>
        <h1>България, която изгубихме</h1>
        <p>Дигитален архив на снимки, документи и лични истории.</p>
        <a *nbIsGranted="['sign-in', 'session']" nbButton status="primary" routerLink="/register">
          Създай профил
        </a>
        <a *nbIsGranted="['view', 'account']" nbButton status="primary" routerLink="/account">
          Моят профил
        </a>
      </nb-card-body>
    </nb-card>
  `,
  styles: ['h1 { margin-top: 0; }'],
})
export class Home {}

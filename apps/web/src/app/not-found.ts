import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NbButtonModule, NbCardModule } from '@nebular/theme';

@Component({
  imports: [RouterLink, NbButtonModule, NbCardModule],
  template: `
    <nb-card>
      <nb-card-body>
        <h1>Страницата не е намерена</h1>
        <a nbButton status="primary" routerLink="/">Към началото</a>
      </nb-card-body>
    </nb-card>
  `,
})
export class NotFound {}

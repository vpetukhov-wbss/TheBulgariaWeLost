import { Component, DestroyRef, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NbSecurityModule } from '@nebular/security';
import { NbButtonModule, NbCardModule } from '@nebular/theme';
import { ArchiveSeo } from './features/archive/archive-seo';
import { SitePresentationResource } from './core/site-presentation/site-presentation.resource';

@Component({
  imports: [RouterLink, NbButtonModule, NbCardModule, NbSecurityModule],
  template: `
    <nb-card>
      <nb-card-body>
        <h1>{{ presentation().siteName }}</h1>
        <p>Дигитален архив на снимки, документи и лични истории.</p>
        <p><a nbButton status="primary" routerLink="/archive">Разгледай архива</a></p>
        <a *nbIsGranted="['sign-in', 'session']" nbButton status="primary" routerLink="/register">
          Създай профил
        </a>
        <a *nbIsGranted="['view', 'account']" nbButton status="primary" routerLink="/account">
          Моят профил
        </a>
      </nb-card-body>
    </nb-card>
    @if (presentation().featuredMaterials.length) {
      <nb-card>
        <nb-card-header><h2>Избрано от архива</h2></nb-card-header>
        <nb-card-body>
          <ul>
            @for (material of presentation().featuredMaterials; track material.id) {
              <li>
                <a [routerLink]="['/materials', material.slug]">{{ material.title }}</a>
              </li>
            }
          </ul>
        </nb-card-body>
      </nb-card>
    }
  `,
  styles: ['h1, h2 { margin: 0; } h2 { font-size: 1.15rem; }'],
})
export class Home {
  protected readonly presentation = inject(SitePresentationResource).settings;

  constructor() {
    const seo = inject(ArchiveSeo);
    inject(DestroyRef).onDestroy(() => seo.clear());
    seo.set('Начало', 'Дигитален архив на снимки, документи и лични истории.', '/');
  }
}

import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NbButtonModule, NbCardModule, NbInputModule } from '@nebular/theme';
import {
  adminScreen,
  editorScreen,
  homeScreen,
  mobileHomeScreen,
  normalize,
  roles,
  screens,
} from './mock-data';

import { screenPath } from './screen-links';

@Component({
  imports: [FormsModule, RouterLink, NbInputModule, NbButtonModule, NbCardModule],
  template: `
    <main class="mock-catalog">
      <h1>Екрани с мок данни</h1>
      <nav class="mock-entry-points" aria-label="Начални екрани по роля">
        @for (entry of entries; track entry.id) {
          <a nbButton [routerLink]="screenPath(entry.id)" status="primary" appearance="outline">
            {{ entry.label }}
          </a>
        }
      </nav>
      <label for="catalog-search">Намери екран</label>
      <input
        id="catalog-search"
        nbInput
        fullWidth
        type="search"
        placeholder="Име на екран, секция или роля"
        [ngModel]="query()"
        (ngModelChange)="query.set($event)"
      />
      <p role="status">{{ count() }} от {{ total }} екрана</p>
      @for (group of matching(); track group.key) {
        <nb-card>
          <nb-card-header>{{ group.section }} · {{ group.area }}</nb-card-header>
          <nb-card-body>
            <ul class="mock-screen-links">
              @for (screen of group.screens; track screen.id) {
                <li>
                  <a [routerLink]="screenPath(screen.id)">{{ screen.name }}</a>
                  @if (screen.role === 'editor') {
                    <small>Редактор</small>
                  }
                </li>
              }
            </ul>
          </nb-card-body>
        </nb-card>
      }
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MockCatalog {
  protected readonly screenPath = screenPath;
  protected readonly query = signal('');
  protected readonly total = screens.length;
  protected readonly entries = [
    { id: homeScreen, label: 'Публичен сайт' },
    { id: mobileHomeScreen, label: 'Мобилен сайт' },
    { id: editorScreen, label: 'Редактор' },
    { id: adminScreen, label: 'Администратор' },
  ];
  protected readonly matching = computed(() => {
    const query = normalize(this.query());
    const groups = new Map<
      string,
      { key: string; area: string; section: string; screens: (typeof screens)[number][] }
    >();

    for (const screen of screens) {
      const area =
        screen.role !== 'user' ? 'Управление' : screen.w < 500 ? 'Мобилни' : 'Публичен сайт';
      const terms = normalize(
        [screen.id, screen.name, screen.section, roles[screen.role], area].join(' '),
      );
      if (!terms.includes(query)) continue;

      const section = screen.section.replace(/^\d+ · /, '');
      const key = area + screen.section;
      const group = groups.get(key) ?? { key, area, section, screens: [] };
      group.screens.push(screen);
      groups.set(key, group);
    }
    return Array.from(groups.values());
  });
  protected readonly count = computed(() =>
    this.matching().reduce((total, group) => total + group.screens.length, 0),
  );
}

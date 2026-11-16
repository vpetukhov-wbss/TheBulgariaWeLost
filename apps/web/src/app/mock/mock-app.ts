import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NbEvaIconsModule } from '@nebular/eva-icons';
import { NbLayoutModule } from '@nebular/theme';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NbLayoutModule, NbEvaIconsModule],
  template: `
    <nb-layout class="mock-archive">
      <nb-layout-column class="mock-layout">
        <router-outlet />
      </nb-layout-column>
    </nb-layout>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MockApp {}

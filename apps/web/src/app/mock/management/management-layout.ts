import { ChangeDetectionStrategy, Component, input, linkedSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NbButtonModule, NbIconModule } from '@nebular/theme';
import { icon, MockScreenData } from '../mock-data';
import { screenPath } from '../screen-links';

@Component({
  selector: 'app-management-layout',
  imports: [RouterLink, NbIconModule, NbButtonModule],
  templateUrl: './management-layout.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManagementLayout {
  readonly view = input.required<MockScreenData>();
  protected readonly menuOpen = linkedSignal({ source: this.view, computation: () => false });
  protected readonly screenPath = screenPath;
  protected readonly icon = icon;
}

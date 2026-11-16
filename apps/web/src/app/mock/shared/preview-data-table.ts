import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  TemplateRef,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NbButtonModule } from '@nebular/theme';
import { MockNode, MockTableRow } from '../mock-data';
import { screenPath } from '../screen-links';

@Component({
  selector: 'app-preview-data-table',
  imports: [NgTemplateOutlet, RouterLink, NbButtonModule],
  templateUrl: './preview-data-table.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PreviewDataTable {
  readonly columns = input.required<readonly string[]>();
  readonly rows = input.required<readonly MockTableRow[]>();
  readonly paginated = input(false);
  readonly page = model(0);
  readonly cellTemplate = input.required<TemplateRef<{ $implicit: MockNode }>>();
  protected readonly pageSize = 4;
  protected readonly first = computed(() => this.page() * this.pageSize);
  protected readonly visibleRows = computed(() =>
    this.paginated() ? this.rows().slice(this.first(), this.first() + this.pageSize) : this.rows(),
  );
  protected readonly screenPath = screenPath;

  protected changePage(offset: number): void {
    this.page.update((page) => page + offset);
  }
}

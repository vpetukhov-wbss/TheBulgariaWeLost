import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { NbButtonModule, NbInputModule } from '@nebular/theme';

@Component({
  selector: 'app-archive-search-form',
  imports: [NbButtonModule, NbInputModule],
  template: `
    <form class="preview-archive-search" role="search" (submit)="submit($event, query.value)">
      <input
        #query
        nbInput
        fullWidth
        type="search"
        aria-label="Търси в архива"
        placeholder="Търси по тема, място или година"
      />
      <button class="mock-button" nbButton type="submit" status="primary" size="small">
        Търси
      </button>
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArchiveSearchForm {
  readonly search = output<string>();

  protected submit(event: Event, query: string): void {
    event.preventDefault();
    this.search.emit(query);
  }
}

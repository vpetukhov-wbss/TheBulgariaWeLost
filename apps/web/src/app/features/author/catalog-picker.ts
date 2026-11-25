import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NbButtonModule, NbInputModule } from '@nebular/theme';
import { map, switchMap, timer } from 'rxjs';
import type { GetAuthorCatalogOptions$Params } from '../../api/generated/fn/authoring/get-author-catalog-options';
import { AuthoringService } from '../../api/generated/services/authoring.service';

@Component({
  selector: 'app-author-catalog-picker',
  imports: [NbInputModule, NbButtonModule],
  template: `
    @let options = choices.hasValue() ? choices.value() : [];
    <fieldset [disabled]="disabled()" class="picker">
      <legend>{{ label() }}</legend>
      @if (selected().length) {
        <ul>
          @for (id of selected(); track id) {
            <li>
              {{ nameOf(id) }}
              @if (!disabled()) {
                <button
                  nbButton
                  ghost
                  size="tiny"
                  type="button"
                  [attr.aria-label]="'Премахни ' + nameOf(id)"
                  (click)="remove(id)"
                >
                  ×
                </button>
              }
            </li>
          }
        </ul>
      }
      @if (!disabled()) {
        <label [for]="field() + '-search'">Търси по име</label>
        <input
          nbInput
          fullWidth
          [id]="field() + '-search'"
          maxlength="100"
          (input)="search.set($any($event.target).value)"
        />
        @if (choices.isLoading()) {
          <small role="status">Зарежда се…</small>
        } @else if (choices.error()) {
          <button nbButton outline size="small" type="button" (click)="choices.reload()">
            Опитай отново
          </button>
        } @else if (!options.length) {
          <small>Няма достъпни записи.</small>
        } @else {
          <select [attr.aria-label]="'Избери от ' + label()" (change)="choose($event)">
            <option value="">Избери…</option>
            @for (option of options; track option.id) {
              <option [value]="option.id" [disabled]="selected().includes(option.id)">
                {{ option.label }}
              </option>
            }
          </select>
        }
      }
    </fieldset>
  `,
  styles: [
    `
      .picker {
        display: grid;
        gap: 0.35rem;
        min-width: 0;
        margin: 0 0 1rem;
        border: 1px solid var(--border-basic-color-3);
        border-radius: 0.5rem;
        padding: 0.75rem;
      }
      legend {
        font-weight: 700;
      }
      ul {
        margin: 0;
        padding-inline-start: 1.15rem;
        overflow-wrap: anywhere;
      }
      select {
        width: 100%;
        min-height: 2.4rem;
      }
      small {
        color: var(--text-hint-color);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogPicker {
  private readonly api = inject(AuthoringService);
  readonly field = input.required<GetAuthorCatalogOptions$Params['field']>();
  readonly label = input.required<string>();
  readonly selected = input.required<string[]>();
  readonly disabled = input(false);
  readonly selectionChange = output<string[]>();
  protected readonly search = signal('');
  protected readonly choices = rxResource({
    params: () => ({ field: this.field(), q: this.search(), selected: this.selected().join(',') }),
    stream: ({ params }) =>
      timer(180).pipe(
        switchMap(() => this.api.getAuthorCatalogOptions(params)),
        map((page) => page.items),
      ),
  });

  protected nameOf(id: string): string {
    return (
      (this.choices.hasValue()
        ? this.choices.value().find((item) => item.id === id)?.label
        : undefined) ?? (this.choices.isLoading() ? 'Зарежда се…' : 'Недостъпен запис')
    );
  }

  protected choose(event: Event): void {
    const input = event.target as HTMLSelectElement;
    if (input.value && !this.selected().includes(input.value) && this.selected().length < 100) {
      this.selectionChange.emit([...this.selected(), input.value]);
    }
    input.value = '';
  }

  protected remove(id: string): void {
    this.selectionChange.emit(this.selected().filter((item) => item !== id));
  }
}

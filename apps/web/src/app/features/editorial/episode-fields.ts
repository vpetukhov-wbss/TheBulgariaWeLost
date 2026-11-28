import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NbButtonModule, NbInputModule } from '@nebular/theme';
import type { EpisodeChapter } from '../../api/generated/models/episode-chapter';
import type { EpisodeDraft } from '../../api/generated/models/episode-draft';

@Component({
  selector: 'app-episode-fields',
  imports: [FormsModule, NbButtonModule, NbInputModule],
  template: `
    <fieldset>
      <legend>Епизод</legend>
      <label>
        Адрес в YouTube
        <input
          nbInput
          fullWidth
          type="url"
          maxlength="2000"
          [ngModel]="episode().youtubeUrl ?? ''"
          (ngModelChange)="edit({ youtubeUrl: $event })"
        />
      </label>
      <label>
        Транскрипция
        <textarea
          nbInput
          fullWidth
          rows="6"
          maxlength="30000"
          [ngModel]="episode().transcript ?? ''"
          (ngModelChange)="edit({ transcript: $event })"
        ></textarea>
      </label>
      <h3>Времеви точки</h3>
      @for (chapter of episode().chapters ?? []; track $index) {
        <div class="chapter">
          <label>
            Секунда от началото
            <input
              nbInput
              fullWidth
              type="number"
              min="0"
              max="86399"
              step="1"
              [ngModel]="chapter.startSeconds"
              (ngModelChange)="editChapter($index, { startSeconds: $event })"
            />
          </label>
          <label>
            Заглавие на точката
            <input
              nbInput
              fullWidth
              maxlength="160"
              [ngModel]="chapter.title"
              (ngModelChange)="editChapter($index, { title: $event })"
            />
          </label>
          <button
            nbButton
            size="small"
            type="button"
            (click)="removeChapter($index)"
            [attr.aria-label]="'Премахни времева точка ' + ($index + 1)"
          >
            Премахни
          </button>
        </div>
      }
      <button
        nbButton
        size="small"
        outline
        type="button"
        (click)="addChapter()"
        [disabled]="(episode().chapters?.length ?? 0) >= 100"
      >
        Добави времева точка
      </button>
    </fieldset>
  `,
  styles: `
    :host {
      display: block;
      margin-block: 1rem;
    }
    fieldset {
      min-inline-size: 0;
    }
    label {
      display: block;
      margin-block: 0.5rem;
    }
    .chapter {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
      align-items: end;
      gap: 0.5rem;
      margin-block-end: 0.75rem;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EpisodeFields {
  readonly episode = input<EpisodeDraft>({});
  readonly changed = output<EpisodeDraft>();

  protected edit(patch: Partial<EpisodeDraft>): void {
    this.changed.emit({ ...this.episode(), ...patch });
  }

  protected addChapter(): void {
    const chapters = this.episode().chapters ?? [];
    this.edit({ chapters: [...chapters, { startSeconds: 0, title: '' }] });
  }

  protected editChapter(index: number, patch: Partial<EpisodeChapter>): void {
    this.edit({
      chapters: this.episode().chapters?.map((chapter, position) =>
        position === index ? { ...chapter, ...patch } : chapter,
      ),
    });
  }

  protected removeChapter(index: number): void {
    this.edit({ chapters: this.episode().chapters?.filter((_, position) => position !== index) });
  }
}

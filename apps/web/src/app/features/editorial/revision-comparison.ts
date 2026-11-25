import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { NbAlertModule, NbButtonModule, NbCardModule, NbInputModule } from '@nebular/theme';
import { catchError, firstValueFrom, forkJoin, throwError } from 'rxjs';
import type { MaterialDraft } from '../../api/generated/models/material-draft';
import type { MaterialRevisionDetail } from '../../api/generated/models/material-revision-detail';
import { PublishingService } from '../../api/generated/services/publishing.service';
import { EditorialAccess } from './editorial-access';

function textOf(draft: MaterialDraft): string {
  const titles = { Heading: 'Заглавие', Paragraph: 'Абзац', Quote: 'Цитат' };
  return [
    draft.body,
    ...(draft.blocks ?? []).map((block) => titles[block.type] + '\n' + block.text),
  ]
    .filter(Boolean)
    .join('\n\n');
}

const fields: { label: string; read: (draft: MaterialDraft) => string }[] = [
  { label: 'Заглавие', read: (draft) => draft.title },
  { label: 'Подзаглавие', read: (draft) => draft.subtitle ?? '' },
  { label: 'Резюме', read: (draft) => draft.summary ?? '' },
  { label: 'Съдържание', read: textOf },
  { label: 'Категории', read: (draft) => draft.categoryIds.join('\n') },
  { label: 'Теми', read: (draft) => draft.topicIds.join('\n') },
  { label: 'Източници', read: (draft) => draft.sourceIds.join('\n') },
  {
    label: 'Свързани файлове',
    read: (draft) =>
      draft.mediaRefs
        .map((media) =>
          [media.order, media.role, media.mediaId, media.credit]
            .filter((item) => item !== undefined)
            .join(' · '),
        )
        .join('\n'),
  },
  { label: 'Произход', read: (draft) => draft.provenance ?? '' },
  {
    label: 'Права',
    read: (draft) =>
      (draft.rights.publicDisplayAllowed ? 'Разрешено' : 'Не е разрешено') +
      '\n' +
      draft.rights.statement,
  },
];

@Component({
  selector: 'app-revision-comparison',
  imports: [DatePipe, FormsModule, NbAlertModule, NbButtonModule, NbCardModule, NbInputModule],
  templateUrl: './revision-comparison.html',
  styleUrl: './editorial.scss',
  styles: [
    `
      .versions {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.65rem;
      }
      .versions > div {
        background: var(--background-basic-color-2);
        padding: 0.65rem;
        min-width: 0;
        margin: 0;
      }
      h3 {
        font-size: 1rem;
        line-height: 1.5;
      }
      @media (max-width: 36rem) {
        .versions {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RevisionComparison {
  private readonly api = inject(PublishingService);
  private readonly access = inject(EditorialAccess);
  readonly id = input.required<string>();
  readonly version = input.required<number>();
  readonly canRestore = input.required<boolean>();
  readonly restoration = output<{ revisionNumber: number; reason: string }>();

  protected readonly revisions = rxResource({
    params: () => ({ id: this.id(), version: this.version() }),
    stream: ({ params }) =>
      this.api.listMaterialRevisions({ id: params.id }).pipe(
        catchError((error: unknown) => {
          void this.access.redirectOnAccessError(error);
          return throwError(() => error);
        }),
      ),
  });
  protected readonly first = signal<number | null>(null);
  protected readonly second = signal<number | null>(null);
  protected readonly restoreNumber = signal<number | null>(null);
  protected readonly reason = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly loaded = signal<{
    version: number;
    first: MaterialRevisionDetail;
    second: MaterialRevisionDetail;
  } | null>(null);
  protected readonly result = computed(() => {
    const data = this.loaded();
    if (!data || data.version !== this.version()) return null;
    return {
      first: data.first.revisionNumber,
      second: data.second.revisionNumber,
      fields: fields.map(({ label, read }) => {
        const before = read(data.first.content);
        const after = read(data.second.content);
        return { label, before, after, changed: before !== after };
      }),
    };
  });

  protected async compare(before: number, after: number): Promise<void> {
    if (before === after || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    const version = this.version();
    try {
      const [first, second] = await firstValueFrom(
        forkJoin([
          this.api.getMaterialRevision({ id: this.id(), number: before }),
          this.api.getMaterialRevision({ id: this.id(), number: after }),
        ]),
      );
      this.loaded.set({ first, second, version });
    } catch (error: unknown) {
      if (!(await this.access.redirectOnAccessError(error)))
        this.error.set('Ревизиите не можаха да се сравнят.');
    } finally {
      this.busy.set(false);
    }
  }

  protected restore(): void {
    const revisionNumber = this.restoreNumber();
    const reason = this.reason().trim();
    if (!revisionNumber || reason.length < 3 || !this.canRestore()) return;
    this.restoration.emit({ revisionNumber, reason });
  }
}

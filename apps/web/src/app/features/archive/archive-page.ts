import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
} from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NbAlertModule, NbButtonModule, NbCardModule, NbInputModule } from '@nebular/theme';
import type { SearchArchive$Params } from '../../api/generated/fn/archive-search/search-archive';
import { ArchiveSearchService } from '../../api/generated/services/archive-search.service';
import { CatalogService } from '../../api/generated/services/catalog.service';
import { ArchiveSeo } from './archive-seo';

const groups = { topics: 'Теми', categories: 'Категории', places: 'Локации' } as const;
type Kind = keyof typeof groups;
const types = {
  Story: 'История',
  Document: 'Документ',
  PhotoEssay: 'Фоторазказ',
  Episode: 'Епизод',
} as const;
type MaterialType = keyof typeof types;

function validYear(input: string | null): number | undefined {
  const value = Number(input);
  return Number.isInteger(value) && value >= 1 && value <= 9999 ? value : undefined;
}

@Component({
  imports: [RouterLink, NbAlertModule, NbButtonModule, NbCardModule, NbInputModule],
  templateUrl: './archive-page.html',
  styleUrl: './archive-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ArchivePage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ArchiveSearchService);
  private readonly catalog = inject(CatalogService);
  private readonly seo = inject(ArchiveSeo);
  private readonly routeParams = toSignal(this.route.paramMap, { requireSync: true });
  private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly groups = groups;
  protected readonly types = types;
  protected readonly materialTypes = Object.keys(types) as MaterialType[];
  protected readonly groupKinds = Object.keys(groups) as Kind[];
  protected readonly periods = this.route.snapshot.data['periods'] === true;
  protected readonly kind = computed(() =>
    this.groupKinds.find((kind) => kind === this.routeParams().get('kind')),
  );
  protected readonly slug = computed(() => this.routeParams().get('slug') ?? '');
  protected readonly directory = computed(() => Boolean(this.kind()) && !this.slug());
  protected readonly entry = rxResource({
    params: () => {
      const kind = this.kind();
      const slug = this.slug();
      return kind && slug ? { kind, slug } : undefined;
    },
    stream: ({ params }) => this.catalog.getPublicCatalogEntry(params),
  });
  protected readonly entries = rxResource({
    params: () => {
      const kind = this.kind();
      return kind && this.directory()
        ? { kind, after: this.params().get('after') ?? undefined }
        : undefined;
    },
    stream: ({ params }) => this.catalog.listPublicCatalog(params),
  });
  protected readonly filters = computed<SearchArchive$Params>(() => {
    const query = this.params();
    return {
      q: query.get('q') ?? undefined,
      type: this.materialTypes.find((type) => type === query.get('type')),
      fromYear: validYear(query.get('fromYear')),
      toYear: validYear(query.get('toYear')),
      cursor: query.get('cursor') ?? undefined,
    };
  });
  protected readonly results = rxResource({
    params: () => {
      if (this.directory() || this.unknownKind()) return undefined;
      const filters = this.filters();
      if (!this.slug()) return filters;
      if (!this.entry.hasValue()) return undefined;
      const item = this.entry.value();
      const fields = { topics: 'topicId', categories: 'categoryId', places: 'placeId' } as const;
      return { ...filters, [fields[item.kind]]: item.id };
    },
    stream: ({ params }) => this.api.searchArchive(params),
  });
  protected readonly unknownKind = computed(() => !!this.routeParams().get('kind') && !this.kind());
  protected readonly heading = computed(() => {
    if (this.entry.hasValue()) return this.entry.value().name;
    const label = this.kind();
    return label ? groups[label] : this.periods ? 'Исторически периоди' : 'Архив';
  });
  protected readonly description = computed(() => {
    if (!this.entry.hasValue()) return '';
    const fields = this.entry.value().fields;
    const value: unknown = fields['summary'] ?? fields['description'];
    return typeof value === 'string' ? value : '';
  });
  protected readonly unavailable = computed(() => {
    const error = this.entry.error();
    return this.unknownKind() || (error instanceof HttpErrorResponse && error.status === 404);
  });
  protected readonly error = computed(() =>
    Boolean(this.entry.error() || this.entries.error() || this.results.error()),
  );
  protected readonly loading = computed(
    () => this.entry.isLoading() || this.entries.isLoading() || this.results.isLoading(),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.seo.clear());
    effect(() => {
      const canonical = this.entry.hasValue()
        ? '/archive/' + this.entry.value().kind + '/' + encodeURIComponent(this.entry.value().slug)
        : this.router.url.split(/[?#]/)[0];
      const { q, type, fromYear, toYear, cursor } = this.filters();
      this.seo.set(
        this.heading(),
        this.description().slice(0, 160) ||
          'Снимки, документи и лични истории от българския архив.',
        canonical,
        !(
          this.error() ||
          this.unavailable() ||
          q ||
          type ||
          fromYear ||
          toYear ||
          cursor ||
          (this.slug() && !this.entry.hasValue())
        ),
      );
    });
  }

  protected submit(event: SubmitEvent, form: HTMLFormElement): void {
    event.preventDefault();
    const data = new FormData(form);
    const value = (name: string) => String(data.get(name) ?? '').trim() || null;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: value('q'),
        type: value('type'),
        fromYear: value('fromYear'),
        toYear: value('toYear'),
      },
    });
  }

  protected retry(): void {
    if (this.entry.error()) this.entry.reload();
    else if (this.directory()) this.entries.reload();
    else this.results.reload();
  }
}

import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  NbButtonModule,
  NbCheckboxModule,
  NbIconModule,
  NbInputModule,
  NbSelectModule,
} from '@nebular/theme';
import type { MockNode, MockScreenData, MockTableRow } from './mock-data';
import {
  adminScreen,
  homeScreen,
  color,
  icon,
  nodeText,
  normalize,
  pictures,
  screensById,
} from './mock-data';

import { ArchiveHomePage } from './archive/archive-home-page';
import { AdminDashboardPage } from './management/admin-dashboard-page';
import { ManagementLayout } from './management/management-layout';
import { screenPath } from './screen-links';
import { PreviewDataTable } from './shared/preview-data-table';

const mobileArchive = '21:385';
const desktopArchive = '19:1884';
const noMobileResults = '34:747';
const noDesktopResults = '27:345';
const archiveTerms = ['железници', 'бдж', 'влак', 'транспорт', 'българия', 'гара', 'локомотив'];

const equivalentScreens: Readonly<Record<string, string>> = {
  '19:1791': '21:342',
  '19:1884': mobileArchive,
  '19:1983': '21:425',
  '19:2052': '24:337',
  '19:2128': '27:698',
  '19:2182': '27:719',
  '19:2230': '27:739',
  '19:2290': '27:762',
  '19:2341': '27:1071',
  '19:2409': '27:1091',
  '19:2478': '22:376',
  '19:2533': '21:451',
  '19:2594': '27:883',
  '19:2640': '27:929',
  '19:2692': '22:327',
  '19:2737': '27:906',
  '19:2785': '27:781',
  '19:2853': '27:822',
  '19:2944': '21:488',
  '19:3043': '27:857',
  '19:3102': '21:544',
  '19:3193': '21:586',
  '19:3281': '21:621',
  '22:433': '24:358',
  [noDesktopResults]: noMobileResults,
  '27:389': '34:773',
};

const fallbackLinks: Readonly<Record<string, string>> = {
  'Публичен преглед': '19:1983',
  'Отвори медията': '5:579',
  'Към бекъпите': '4:2315',
  'Сравни версиите': '29:11123',
};

function walk(node: MockNode): MockNode[] {
  return [node, ...(node.ch ?? []).flatMap(walk)];
}

@Component({
  imports: [
    NgTemplateOutlet,
    ArchiveHomePage,
    AdminDashboardPage,
    ManagementLayout,
    PreviewDataTable,
    FormsModule,
    RouterLink,
    NbButtonModule,
    NbCheckboxModule,
    NbIconModule,
    NbInputModule,
    NbSelectModule,
  ],
  templateUrl: './mock-screen.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MockScreen {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly title = inject(Title);
  private values = new WeakMap<MockNode, string>();
  private choices = new WeakMap<MockNode, boolean>();

  protected readonly current = signal<MockScreenData | undefined>(undefined);
  protected readonly query = signal('');
  protected readonly feedback = signal('');
  protected readonly page = signal(0);
  protected readonly file = signal('');
  protected readonly filters = signal<ReadonlyMap<MockNode, string>>(new Map());
  protected readonly color = color;
  protected readonly icon = icon;
  protected readonly nodeText = nodeText;
  protected readonly pictures = pictures;
  protected readonly homeScreen = homeScreen;
  protected readonly adminScreen = adminScreen;
  protected readonly screenPath = screenPath;

  protected readonly nodes = computed(() => {
    const screen = this.current();
    return screen ? walk(screen.body) : [];
  });
  protected readonly heading = computed(() =>
    this.nodes().find((node) => node.k === 'text' && (node.s ?? 0) >= 27),
  );
  protected readonly equivalent = computed(() => {
    const id = this.current()?.id;
    return id
      ? (equivalentScreens[id] ??
          Object.keys(equivalentScreens).find((key) => equivalentScreens[key] === id))
      : undefined;
  });
  protected readonly cancelDialog = computed(() => {
    const dialog = this.current()?.dialog;
    return dialog
      ? walk(dialog).find((node) => node.to && /^(Отказ|Затвори|Назад)/.test(node.t ?? ''))?.to
      : undefined;
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const screen = screensById.get(params.get('screen') ?? this.route.snapshot.data['screen']);
      this.current.set(screen);
      this.query.set(
        this.route.snapshot.queryParamMap.get('q') ??
          (screen?.id === desktopArchive ? 'железници' : ''),
      );
      this.file.set(this.route.snapshot.queryParamMap.get('file') ?? '');
      this.page.set(0);
      this.filters.set(new Map());
      this.feedback.set('');
      this.values = new WeakMap();
      this.choices = new WeakMap();
      this.title.setTitle((screen?.name ?? 'Екранът липсва') + ' · България, която изгубихме');
    });
  }

  protected isSearch(node: MockNode): boolean {
    return node.k === 'search' || node.i === 'search';
  }

  protected label(node: MockNode): string {
    return node.label && node.label !== 'null' ? node.label : node.t || 'Търсене';
  }

  protected placeholder(node: MockNode): string {
    const text = node.t?.replace(/ Търси$/, '') ?? '';
    return this.isSearch(node) || /^(Въвед|Добав|Посочи|Създай|Напиши|[○•])/.test(text) ? text : '';
  }

  protected value(node: MockNode): string {
    if (this.isSearch(node)) return this.query();
    return this.values.get(node) ?? (this.placeholder(node) ? '' : (node.t ?? ''));
  }

  protected setValue(node: MockNode, value: string): void {
    if (this.isSearch(node)) {
      this.query.set(value);
      this.page.set(0);
    } else {
      this.values.set(node, value);
    }
  }

  protected inputType(node: MockNode): string {
    if (this.isSearch(node)) return 'search';
    if (node.i === 'eye' || /парола/i.test(node.label ?? '')) return 'password';
    if (node.i === 'mail' || /имейл/i.test(node.label ?? '')) return 'email';
    return 'text';
  }

  protected checked(node: MockNode): boolean {
    return this.choices.get(node) ?? !!node.on;
  }

  protected setChecked(node: MockNode, checked: boolean): void {
    this.choices.set(node, checked);
  }

  protected dropdownOptions(node: MockNode): string[] {
    if (node.k === 'filter') {
      const values = this.nodes().flatMap((item) => {
        const column = this.filterColumn(item, node);
        return column < 0
          ? []
          : (item.rows ?? []).map((row) => row.cells[column]?.map(nodeText).join(' ') ?? '');
      });
      return ['', ...new Set(values.filter(Boolean))];
    }

    const label = this.label(node);
    const extra: Record<string, string[]> = {
      Роля: ['Потребител', 'Редактор', 'Администратор'],
      Място: ['Цяла България', 'Стара Загора', 'Казанлък', 'Варна'],
      Срок: ['До определена дата', '24 часа', '7 дни', '30 дни'],
      'Вид проблем': ['Права за показване', 'Неточна информация', 'Друго'],
      'Право за показване': [
        'Имам разрешение за показване',
        'Обществено достояние',
        'Мои авторски права',
      ],
      'По съответствие': ['По съответствие', 'Най-нови', 'Най-стари'],
    };
    return [...new Set([node.t ?? '', ...(extra[label] ?? [])])];
  }

  protected filterValue(node: MockNode): string {
    return this.filters().get(node) ?? '';
  }

  protected setFilter(node: MockNode, value: string): void {
    this.filters.update((previous) => new Map(previous).set(node, value));
    this.page.set(0);
  }

  private filterColumn(table: MockNode, node: MockNode): number {
    const label = normalize(node.t ?? '');
    return (
      table.cols?.findIndex((heading) => {
        const column = normalize(heading);
        return column !== '' && (column === label || label.startsWith(column + ' '));
      }) ?? -1
    );
  }

  protected matchingRows(table: MockNode): MockTableRow[] {
    const query = normalize(this.query());
    return (table.rows ?? []).filter((row) => {
      if (query && !normalize(row.cells.flat().map(nodeText).join(' ')).includes(query))
        return false;
      for (const [node, value] of this.filters()) {
        const column = this.filterColumn(table, node);
        if (value && column >= 0 && row.cells[column]?.map(nodeText).join(' ') !== value)
          return false;
      }
      return true;
    });
  }

  protected enterSearch(event: Event, node: MockNode): void {
    if (!this.isSearch(node)) return;
    event.preventDefault();
    if (this.current()?.role === 'user') this.searchArchive();
  }

  protected searchArchive(searchText = this.query()): void {
    const mobile = (this.current()?.w ?? 0) < 500;
    const query = normalize(searchText);
    const found =
      !query || archiveTerms.some((term) => term.includes(query) || query.includes(term));
    const target = found
      ? mobile
        ? mobileArchive
        : desktopArchive
      : mobile
        ? noMobileResults
        : noDesktopResults;
    if (this.current()?.id === target) {
      this.feedback.set('Резултатите от търсенето са обновени.');
    }
    void this.router.navigate([screenPath(target)], { queryParams: { q: searchText } });
  }

  protected action(node: MockNode): void {
    const label = node.t ?? '';
    const view = this.current();
    if (!view) return;
    if (label === 'Търси' && view.role === 'user') {
      this.searchArchive();
      return;
    }
    const target = node.to ?? fallbackLinks[label];
    if (target) {
      void this.router.navigate([screenPath(target)], {
        queryParams: /файл|преглед/i.test(label) && this.file() ? { file: this.file() } : undefined,
      });
      return;
    }
    this.feedback.set(`Действието „${label}“ е изпълнено в мок режима.`);
  }

  protected chooseFile(event: Event, node: MockNode): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0);
    if (!file) return;
    this.file.set(file.name);
    this.feedback.set(`Избран файл „${file.name}“.`);
    if (node.to) {
      void this.router.navigate([screenPath(node.to)], { queryParams: { file: file.name } });
    }
  }

  protected isFileButton(node: MockNode): boolean {
    return node.t === 'Избери файл' && ['22:433', '24:358'].includes(this.current()?.id ?? '');
  }

  protected closeDialog(): void {
    const route = this.cancelDialog();
    if (route) void this.router.navigate([screenPath(route)]);
  }
}

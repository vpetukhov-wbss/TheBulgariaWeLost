import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NbAlertModule, NbButtonModule, NbCardModule, NbInputModule } from '@nebular/theme';
import { firstValueFrom } from 'rxjs';
import type { CreateMaterialRequest } from '../../api/generated/models/create-material-request';
import type { MaterialBlock } from '../../api/generated/models/material-block';
import type { MaterialDetail } from '../../api/generated/models/material-detail';
import type { UpdateMaterialDraftRequest } from '../../api/generated/models/update-material-draft-request';
import { AuthoringService } from '../../api/generated/services/authoring.service';
import { actionError, problemCode } from '../../core/auth/auth-errors';
import { authorStatus } from './author-status';
import { CatalogPicker } from './catalog-picker';

type CatalogField = 'categoryIds' | 'topicIds' | 'sourceIds';

const blockLabels = { Heading: 'Заглавие', Paragraph: 'Абзац', Quote: 'Цитат' };
const catalogLabels: Record<CatalogField, string> = {
  categoryIds: 'Категории',
  topicIds: 'Теми',
  sourceIds: 'Източници',
};
const blockerLabels: Record<string, string> = {
  content_required: 'Добави съдържание.',
  empty_block: 'Попълни или премахни празните блокове.',
  category_required: 'Добави категория.',
  topic_required: 'Добави тема.',
  source_required: 'Добави източник.',
  material_title_required: 'Заглавието трябва да е поне 3 знака.',
  material_rights_missing: 'Потвърди правото за публично показване.',
  rights_statement_required: 'Опиши основанието за правата.',
  'catalog_selection_unavailable:categoryIds':
    'Някоя избрана категория вече е недостъпна. Прегледай избора.',
  'catalog_selection_unavailable:topicIds':
    'Някоя избрана тема вече е недостъпна. Прегледай избора.',
  'catalog_selection_unavailable:sourceIds':
    'Някой избран източник вече е недостъпен. Прегледай избора.',
};

@Component({
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NbAlertModule,
    NbButtonModule,
    NbCardModule,
    NbInputModule,
    CatalogPicker,
  ],
  templateUrl: './material-composer.html',
  styleUrl: './material-composer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaterialComposer implements OnInit {
  private readonly api = inject(AuthoringService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly builder = inject(FormBuilder).nonNullable;
  private etag: string | null = null;

  protected readonly id = this.route.snapshot.paramMap.get('id');
  protected readonly material = signal<MaterialDetail | null>(null);
  protected readonly blocks = signal<MaterialBlock[]>([]);
  protected readonly busy = signal(false);
  protected readonly loading = signal(!!this.id);
  protected readonly error = signal('');
  protected readonly success = signal('');
  protected readonly conflict = signal(false);
  protected readonly blockers = signal<string[]>([]);
  protected readonly canEdit = computed(
    () => this.material()?.allowedActions.includes('SubmitForReview') ?? false,
  );
  protected readonly status = authorStatus;
  protected readonly labels = blockLabels;
  protected readonly catalogFields = Object.keys(catalogLabels) as CatalogField[];
  protected readonly catalogLabels = catalogLabels;

  protected readonly createForm = this.builder.group({
    title: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(200)]],
    type: this.builder.control<CreateMaterialRequest['type']>('Story'),
  });
  protected readonly form = this.builder.group({
    title: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(200)]],
    subtitle: ['', Validators.maxLength(300)],
    summary: ['', Validators.maxLength(1_000)],
    body: ['', Validators.maxLength(100_000)],
    categoryIds: this.builder.control<string[]>([]),
    topicIds: this.builder.control<string[]>([]),
    sourceIds: this.builder.control<string[]>([]),
    provenance: ['', Validators.maxLength(2_000)],
    publicDisplayAllowed: [false],
    rightsStatement: ['', Validators.maxLength(2_000)],
  });

  ngOnInit(): void {
    if (this.id) void this.load();
  }

  protected async create(): Promise<void> {
    const draft = this.createForm.getRawValue();
    if (this.busy()) return;
    if (this.createForm.invalid || draft.title.trim().length < 3) {
      this.error.set(blockerLabels['material_title_required']);
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const material = await firstValueFrom(
        this.api.createAuthorMaterial({ body: { ...draft, language: 'bg' } }),
      );
      await this.router.navigate(['/account/materials', material.id], { replaceUrl: true });
    } catch (error: unknown) {
      this.error.set(actionError(error, 'Черновата не можа да се създаде.'));
    } finally {
      this.busy.set(false);
    }
  }

  protected async load(): Promise<void> {
    if (!this.id || this.busy()) return;
    this.loading.set(true);
    this.error.set('');
    try {
      const result = await firstValueFrom(this.api.getAuthorMaterial$Response({ id: this.id }));
      this.apply(result.body, result.headers.get('ETag'));
      this.success.set('');
    } catch (error: unknown) {
      this.error.set(
        error instanceof HttpErrorResponse && error.status === 404
          ? 'Този материал не е достъпен в авторското ти пространство.'
          : actionError(error, 'Материалът не можа да се зареди.'),
      );
    } finally {
      this.loading.set(false);
    }
  }

  protected add(type: MaterialBlock['type']): void {
    this.blocks.update((blocks) => [...blocks, { id: crypto.randomUUID(), type, text: '' }]);
  }

  protected edit(id: string, event: Event): void {
    const text = (event.target as HTMLTextAreaElement).value;
    this.blocks.update((blocks) =>
      blocks.map((block) => (block.id === id ? { ...block, text } : block)),
    );
  }

  protected remove(id: string): void {
    this.blocks.update((blocks) => blocks.filter((block) => block.id !== id));
  }

  protected move(index: number, offset: -1 | 1): void {
    this.blocks.update((blocks) => {
      const target = index + offset;
      if (target < 0 || target >= blocks.length) return blocks;
      const reordered = [...blocks];
      [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
      return reordered;
    });
  }

  protected describeBlocker(code: string): string {
    return (
      blockerLabels[code] ??
      (code.startsWith('media_rights_missing:')
        ? 'Свързаният файл изисква проверка на правата.'
        : 'Провери данните на материала.')
    );
  }

  protected async save(submit = false): Promise<void> {
    if (!this.id || !this.canEdit() || this.busy() || this.loading() || this.conflict()) return;
    const value = this.form.getRawValue();
    this.error.set('');
    this.success.set('');
    if (this.form.invalid || value.title.trim().length < 3) {
      this.error.set('Провери заглавието и допустимата дължина на полетата.');
      return;
    }
    if (!this.etag) {
      this.conflict.set(true);
      this.error.set('Липсва версия за безопасен запис. Зареди черновата отново.');
      return;
    }
    const { publicDisplayAllowed, rightsStatement, ...draft } = value;
    const body: UpdateMaterialDraftRequest = {
      ...draft,
      ...(this.material()?.draft.body !== undefined ? { body: draft.body } : { body: undefined }),
      blocks: this.blocks(),
      rights: { publicDisplayAllowed, statement: rightsStatement.trim() || 'Не са потвърдени.' },
    };
    if (submit && publicDisplayAllowed && rightsStatement.trim().length < 3) {
      this.error.set(blockerLabels['rights_statement_required']);
      return;
    }
    if (new TextEncoder().encode(JSON.stringify(body)).byteLength > 100_000) {
      this.error.set(
        'Черновата надхвърля максималния размер за запис. Съкрати съдържанието и опитай отново.',
      );
      return;
    }
    this.busy.set(true);
    try {
      const saved = await firstValueFrom(
        this.api.updateAuthorDraft$Response({ id: this.id, 'If-Match': this.etag, body }),
      );
      this.apply(saved.body, saved.headers.get('ETag'));
      this.success.set('Черновата е запазена.');
      if (submit) {
        const submitted = await firstValueFrom(
          this.api.submitAuthorMaterial$Response({
            id: this.id,
            body: { expectedVersion: saved.body.version },
          }),
        );
        this.apply(submitted.body, submitted.headers.get('ETag'));
        this.success.set('Материалът е изпратен за редакционен преглед.');
      }
    } catch (error: unknown) {
      const code = problemCode(error);
      if (code === 'version_conflict' || code === 'material_locked_for_review') {
        this.conflict.set(true);
        this.error.set(
          'Има промяна на сървъра. Твоите промени остават на екрана. Копирай текста, който искаш да запазиш, преди да заредиш актуалната версия.',
        );
      } else if (error instanceof HttpErrorResponse && code === 'submission_incomplete') {
        const problem = error.error as { detail?: string; errors?: string[] } | null;
        this.blockers.set(problem?.errors ?? (problem?.detail ? [problem.detail] : []));
        this.error.set('Черновата е запазена. Изпълни условията за подаване и опитай отново.');
        this.success.set('');
      } else {
        this.error.set(
          actionError(
            error,
            submit ? 'Материалът не можа да бъде изпратен.' : 'Черновата не можа да се запази.',
          ),
        );
      }
    } finally {
      this.busy.set(false);
    }
  }

  private apply(material: MaterialDetail, etag: string | null): void {
    const draft = material.draft;
    this.etag = etag;
    this.material.set(material);
    this.blocks.set(draft.blocks ?? []);
    this.blockers.set(material.publicationBlockers);
    this.form.reset({
      title: draft.title,
      subtitle: draft.subtitle ?? '',
      summary: draft.summary ?? '',
      body: draft.body ?? '',
      provenance: draft.provenance ?? '',
      categoryIds: draft.categoryIds,
      topicIds: draft.topicIds,
      sourceIds: draft.sourceIds,
      publicDisplayAllowed: draft.rights.publicDisplayAllowed,
      rightsStatement:
        draft.rights.statement === 'Not reviewed.' || draft.rights.statement === 'Не са потвърдени.'
          ? ''
          : draft.rights.statement,
    });
    this.conflict.set(false);
  }
}

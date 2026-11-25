import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NbAlertModule, NbButtonModule, NbCardModule, NbInputModule } from '@nebular/theme';
import { firstValueFrom } from 'rxjs';
import type { StrictHttpResponse } from '../../api/generated/strict-http-response';
import type { MaterialBlock } from '../../api/generated/models/material-block';
import type { MaterialDetail } from '../../api/generated/models/material-detail';
import type { MaterialDraft } from '../../api/generated/models/material-draft';
import type { TransitionMaterialRequest } from '../../api/generated/models/transition-material-request';
import { PublishingService } from '../../api/generated/services/publishing.service';
import { actionError, problemCode } from '../../core/auth/auth-errors';
import { CatalogPicker } from '../author/catalog-picker';
import { EditorialAccess } from './editorial-access';
import { isKey, materialTypes, publicStages, workingStages } from './editorial-labels';
import { RevisionComparison } from './revision-comparison';

type Transition = TransitionMaterialRequest['action'];
type CatalogField = 'categoryIds' | 'topicIds' | 'sourceIds';

const catalogLabels: Record<CatalogField, string> = {
  categoryIds: 'Категории',
  topicIds: 'Теми',
  sourceIds: 'Източници',
};
const operations = {
  StartReview: { label: 'Започни преглед', reason: false },
  RequestChanges: { label: 'Върни за корекции', reason: true },
  Publish: { label: 'Публикувай', reason: false },
  SubmitForReview: { label: 'Изпрати за преглед', reason: false },
  Withdraw: { label: 'Свали от публикация', reason: true },
  Archive: { label: 'Премести в кошчето', reason: true },
  RestoreFromArchive: { label: 'Възстанови от кошчето', reason: true },
} satisfies Record<Transition, { label: string; reason: boolean }>;
const knownBlockers: Record<string, string> = {
  category_required: 'Добави категория.',
  topic_required: 'Добави тема.',
  source_required: 'Добави източник.',
  material_rights_missing: 'Потвърди правото за публично показване.',
};
const blockNames = { Heading: 'Заглавие', Paragraph: 'Абзац', Quote: 'Цитат' };

@Component({
  imports: [
    FormsModule,
    RouterLink,
    NbAlertModule,
    NbButtonModule,
    NbCardModule,
    NbInputModule,
    CatalogPicker,
    RevisionComparison,
  ],
  templateUrl: './material-review.html',
  styleUrl: './editorial.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaterialReview implements OnInit {
  private readonly api = inject(PublishingService);
  private readonly access = inject(EditorialAccess);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  private etag: string | null = null;

  protected readonly current = signal<MaterialDetail | null>(null);
  protected readonly draft = signal<MaterialDraft | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly stale = signal(false);
  protected readonly canSave = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly requested = signal<Transition | null>(null);
  protected readonly reason = signal('');
  protected readonly comparing = signal(false);
  protected readonly actions = computed(() =>
    (this.current()?.allowedActions ?? [])
      .filter((action): action is Transition => isKey(operations, action))
      .map((action) => ({ action, ...operations[action] })),
  );
  protected readonly dirty = computed(
    () => JSON.stringify(this.draft()) !== JSON.stringify(this.current()?.draft ?? null),
  );
  protected readonly editable = computed(() => this.current()?.status !== 'Archived');
  protected readonly types = materialTypes;
  protected readonly working = workingStages;
  protected readonly visibility = publicStages;
  protected readonly catalogFields = Object.keys(catalogLabels) as CatalogField[];
  protected readonly catalogLabels = catalogLabels;
  protected readonly operation = operations;
  protected readonly blockNames = blockNames;

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    if (this.busy()) return;
    this.loading.set(true);
    this.error.set('');
    try {
      this.apply(await firstValueFrom(this.api.getMaterial$Response({ id: this.id })));
      this.notice.set('');
    } catch (error: unknown) {
      await this.fail(error, 'Материалът не може да се зареди.');
    } finally {
      this.loading.set(false);
    }
  }

  protected edit(patch: Partial<MaterialDraft>): void {
    this.draft.update((draft) => (draft ? { ...draft, ...patch } : null));
  }

  protected selectCatalog(field: CatalogField, ids: string[]): void {
    this.edit({ [field]: ids });
  }

  protected setRights(patch: Partial<MaterialDraft['rights']>): void {
    const rights = this.draft()?.rights;
    if (rights) this.edit({ rights: { ...rights, ...patch } });
  }

  protected editBlock(id: string, text: string): void {
    const blocks = this.draft()?.blocks ?? [];
    this.edit({ blocks: blocks.map((block) => (block.id === id ? { ...block, text } : block)) });
  }

  protected addBlock(type: MaterialBlock['type']): void {
    const blocks = this.draft()?.blocks ?? [];
    if (blocks.length >= 40) return;
    this.edit({ blocks: [...blocks, { id: crypto.randomUUID(), type, text: '' }] });
  }

  protected removeBlock(id: string): void {
    this.edit({ blocks: (this.draft()?.blocks ?? []).filter((block) => block.id !== id) });
  }

  protected describeBlocker(code: string): string {
    if (code.startsWith('media_rights_missing:'))
      return 'Провери правата и статуса на файл ' + code.split(':')[1] + '.';
    return knownBlockers[code] ?? 'Провери изискванията за публикуване.';
  }

  protected pick(action: Transition): void {
    this.reason.set('');
    this.requested.set(action);
  }

  protected async save(): Promise<void> {
    const draft = this.draft();
    const tag = this.etag;
    if (!draft || !this.dirty() || !tag || !this.editable()) return;
    if (draft.title.trim().length < 3 || draft.rights.statement.trim().length < 3) {
      this.error.set('Заглавието и основанието за правата трябва да съдържат поне 3 знака.');
      return;
    }
    const { mediaRefs: _mediaRefs, ...editable } = draft;
    if (new TextEncoder().encode(JSON.stringify(editable)).byteLength > 100_000) {
      this.error.set('Черновата надхвърля максималния размер за запис.');
      return;
    }
    await this.run(
      () =>
        firstValueFrom(
          this.api.updateMaterialDraft$Response({ id: this.id, 'If-Match': tag, body: editable }),
        ),
      'Записана е нова работна ревизия.',
    );
  }

  protected async transition(): Promise<void> {
    const material = this.current();
    const action = this.requested();
    const reason = this.reason().trim();
    if (!material || !action || this.dirty() || !material.allowedActions.includes(action)) return;
    if (operations[action].reason && reason.length < 3) {
      this.error.set('Въведи причина с поне 3 знака.');
      return;
    }
    await this.run(
      () =>
        firstValueFrom(
          this.api.transitionMaterial$Response({
            id: this.id,
            body: { action, expectedVersion: material.version, ...(reason ? { reason } : {}) },
          }),
        ),
      action === 'Publish' ? 'Материалът е публикуван.' : 'Статусът на материала е обновен.',
    );
  }

  protected async restore(input: { revisionNumber: number; reason: string }): Promise<void> {
    const material = this.current();
    if (!material || !this.editable() || this.dirty()) return;
    await this.run(
      () =>
        firstValueFrom(
          this.api.restoreMaterialRevision$Response({
            id: this.id,
            body: { ...input, expectedVersion: material.version },
          }),
        ),
      'Ревизията е възстановена като нова работна версия.',
    );
  }

  private async run(
    request: () => Promise<StrictHttpResponse<MaterialDetail>>,
    notice: string,
  ): Promise<void> {
    if (this.busy() || this.loading() || this.stale()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      this.apply(await request());
      this.notice.set(notice);
    } catch (error: unknown) {
      await this.fail(error, 'Действието не можа да се изпълни.');
    } finally {
      this.busy.set(false);
    }
  }

  private apply(response: StrictHttpResponse<MaterialDetail>): void {
    this.etag = response.headers.get('ETag');
    this.canSave.set(this.etag !== null);
    this.current.set(response.body);
    this.draft.set(response.body.draft);
    this.stale.set(false);
    this.requested.set(null);
    this.reason.set('');
  }

  private async fail(error: unknown, fallback: string): Promise<void> {
    if (await this.access.redirectOnAccessError(error)) return;
    const code = problemCode(error);
    if (code === 'version_conflict') {
      this.stale.set(true);
      this.error.set(
        'Има по-нова версия. Копирай нужния локален текст и зареди актуалната версия, преди да продължиш.',
      );
    } else if (code === 'publication_rights_missing') {
      this.error.set(
        'Публикуването е блокирано. Зареди актуалната версия и прегледай правата и източниците.',
      );
    } else if (error instanceof HttpErrorResponse && error.status === 404) {
      this.error.set('Материалът не е достъпен.');
    } else {
      this.error.set(actionError(error, fallback));
    }
  }
}

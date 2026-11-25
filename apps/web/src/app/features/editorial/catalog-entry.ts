import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import type { OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NbAlertModule, NbButtonModule, NbCardModule, NbInputModule } from '@nebular/theme';
import { firstValueFrom } from 'rxjs';
import type { CatalogDetail } from '../../api/generated/models/catalog-detail';
import type { CatalogInput } from '../../api/generated/models/catalog-input';
import type { CatalogSummary } from '../../api/generated/models/catalog-summary';
import type { CatalogTransitionRequest } from '../../api/generated/models/catalog-transition-request';
import type { StrictHttpResponse } from '../../api/generated/strict-http-response';
import { BackOfficeService } from '../../api/generated/services/back-office.service';
import { CatalogService } from '../../api/generated/services/catalog.service';
import { actionError, problemCode } from '../../core/auth/auth-errors';
import { catalogKinds, catalogStatuses } from './catalog-labels';
import { EditorialAccess } from './editorial-access';
import { isKey } from './editorial-labels';

type CatalogAction = CatalogTransitionRequest['action'];
type Verification = NonNullable<CatalogInput['verification']>['status'];
const operations = {
  Propose: { label: 'Предложи', reason: false },
  Publish: { label: 'Публикувай', reason: false },
  Approve: { label: 'Одобри', reason: false },
  Restrict: { label: 'Ограничи', reason: true },
  Reject: { label: 'Отхвърли', reason: true },
  Hide: { label: 'Скрий', reason: true },
  Archive: { label: 'Архивирай', reason: true },
  Restore: { label: 'Възстанови', reason: true },
} satisfies Record<CatalogAction, { label: string; reason: boolean }>;
const errors: Record<string, string> = {
  catalog_hierarchy_cycle: 'Избери родител или каноничен запис извън собствената йерархия.',
  catalog_parent_invalid: 'Избраният родител вече не е достъпен.',
  catalog_merge_requires_administrator: 'Сливане може да извърши администратор.',
  invalid_merge_target: 'Избраната канонична цел вече е недостъпна.',
  catalog_entry_merged: 'Записът вече е слят с друг запис. Зареди актуалната версия.',
};

function stringField(record: Record<string, unknown> | undefined, key: string): string {
  const value = record?.[key];
  return typeof value === 'string' ? value : '';
}

function fieldsOf(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

@Component({
  imports: [
    RouterLink,
    FormsModule,
    ReactiveFormsModule,
    NbAlertModule,
    NbButtonModule,
    NbCardModule,
    NbInputModule,
  ],
  templateUrl: './catalog-entry.html',
  styleUrl: './editorial.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogEntry implements OnInit {
  private readonly api = inject(CatalogService);
  private readonly backOffice = inject(BackOfficeService);
  private readonly access = inject(EditorialAccess);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly builder = inject(FormBuilder).nonNullable;
  private etag: string | null = null;
  private loadNumber = 0;
  protected readonly id = signal<string | null>(null);
  protected readonly kind = signal<CatalogSummary['kind'] | null>(null);
  protected readonly entry = signal<CatalogDetail | null>(null);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly stale = signal(false);
  protected readonly canSave = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly administrator = signal(false);
  protected readonly relatedOptions = signal<CatalogSummary[]>([]);
  protected readonly relatedFailure = signal(false);
  protected readonly requested = signal<CatalogAction | null>(null);
  protected readonly reason = signal('');
  protected readonly merging = signal(false);
  protected readonly targets = signal<CatalogSummary[]>([]);
  protected readonly target = signal<CatalogSummary | null>(null);
  protected readonly targetQuery = signal('');
  protected readonly mergeReason = signal('');
  protected readonly kinds = catalogKinds;
  protected readonly statuses = catalogStatuses;
  protected readonly operation = operations;
  protected readonly matchesCurrentRelation = (entry: CatalogSummary) =>
    entry.id === this.form.controls.relationId.value;
  protected readonly actions = computed(() =>
    (this.entry()?.allowedActions ?? [])
      .filter((action): action is CatalogAction => isKey(operations, action))
      .map((action) => ({ action, label: operations[action].label })),
  );
  protected readonly canMerge = computed(
    () => this.administrator() && !!this.entry()?.allowedActions.includes('Merge'),
  );
  protected readonly form = this.builder.group({
    label: ['', [Validators.required, Validators.minLength(2)]],
    slug: ['', Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)],
    description: [''],
    aliases: [''],
    subtype: [''],
    isVisible: [true],
    relationId: [''],
    url: [''],
    institution: [''],
    fund: [''],
    inventory: [''],
    archiveUnit: [''],
    pageOrFrame: [''],
    allowed: [false],
    rights: [''],
    verification: this.builder.control<Verification>('Unverified'),
    verificationNote: [''],
  });

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const kind = params.get('kind') ?? '';
      this.kind.set(isKey(catalogKinds, kind) ? kind : null);
      this.id.set(params.get('id'));
      this.entry.set(null);
      this.error.set('');
      this.notice.set('');
      this.etag = null;
      this.closeActions();
      this.form.reset();
      if (this.kind()) void this.load();
    });
  }

  protected async load(): Promise<void> {
    const kind = this.kind();
    const id = this.id();
    if (!kind) return;
    const request = ++this.loadNumber;
    this.loading.set(true);
    this.error.set('');
    this.relatedOptions.set([]);
    this.relatedFailure.set(false);
    try {
      if (id) {
        const result = await firstValueFrom(this.api.getCatalogEntry$Response({ kind, id }));
        if (this.loadNumber !== request) return;
        this.apply(result);
      }
    } catch (error: unknown) {
      if (this.loadNumber === request) await this.fail(error, 'Записът не можа да се зареди.');
    } finally {
      if (this.loadNumber === request) this.loading.set(false);
    }
    if (this.loadNumber !== request || (id && !this.entry())) return;
    await Promise.all([this.loadRelated(kind, id, request), this.loadMergeAccess(request)]);
  }

  protected async save(): Promise<void> {
    const kind = this.kind();
    const id = this.id();
    if (!kind || this.entry()?.status === 'Merged') return;
    const body = this.buildInput(kind);
    if (!body) return;
    const etag = this.etag;
    await this.run(async () => {
      if (id && etag) {
        const result = await firstValueFrom(
          this.api.updateCatalogEntry$Response({ id, kind, 'If-Match': etag, body }),
        );
        this.apply(result);
        this.notice.set('Промените са запазени.');
      } else if (!id) {
        const created = await firstValueFrom(this.api.createCatalogEntry({ kind, body }));
        await this.router.navigate(['/admin/catalog', kind, created.id], {
          queryParamsHandling: 'preserve',
          replaceUrl: true,
        });
      }
    });
  }

  protected pick(action: CatalogAction): void {
    this.merging.set(false);
    this.reason.set('');
    this.requested.set(action);
  }

  protected async transition(): Promise<void> {
    const action = this.requested();
    const entry = this.entry();
    const reason = this.reason().trim();
    if (!entry || !action || this.form.dirty || !entry.allowedActions.includes(action)) return;
    if (operations[action].reason && reason.length < 3) {
      this.error.set('Въведи причина с поне 3 знака.');
      return;
    }
    await this.run(async () => {
      const response = await firstValueFrom(
        this.api.transitionCatalogEntry$Response({
          kind: entry.kind,
          id: entry.id,
          body: { action, expectedVersion: entry.version, ...(reason ? { reason } : {}) },
        }),
      );
      this.apply(response);
      this.notice.set('Статусът на записа е обновен.');
    });
  }

  protected async findTargets(): Promise<void> {
    const entry = this.entry();
    if (!entry || !this.canMerge()) return;
    this.requested.set(null);
    this.merging.set(true);
    this.targets.set([]);
    this.target.set(null);
    await this.run(async () => {
      const result = await firstValueFrom(
        this.api.listCatalogEntries({
          kind: entry.kind,
          q: this.targetQuery().trim() || undefined,
        }),
      );
      this.targets.set(
        result.items.filter(
          (item) => item.id !== entry.id && item.status !== 'Merged' && item.status !== 'Rejected',
        ),
      );
    });
  }

  protected chooseTarget(id: string): void {
    this.target.set(this.targets().find((option) => option.id === id) ?? null);
  }

  protected async merge(): Promise<void> {
    const entry = this.entry();
    const target = this.target();
    const reason = this.mergeReason().trim();
    if (!entry || !target || !this.canMerge() || this.form.dirty || reason.length < 3) return;
    await this.run(async () => {
      await firstValueFrom(
        this.api.mergeCatalogEntry({
          kind: entry.kind,
          id: entry.id,
          body: {
            expectedVersion: entry.version,
            targetId: target.id,
            targetExpectedVersion: target.version,
            reason,
          },
        }),
      );
      this.closeActions();
      this.notice.set('Обединяването е прието. Каноничният запис е „' + target.name + '“.');
      this.apply(
        await firstValueFrom(this.api.getCatalogEntry$Response({ kind: entry.kind, id: entry.id })),
      );
    });
  }

  private buildInput(kind: CatalogSummary['kind']): CatalogInput | null {
    this.error.set('');
    const v = this.form.getRawValue();
    const label = v.label.trim();
    const subtype = v.subtype.trim();
    const source = kind === 'sources';
    if (
      this.form.invalid ||
      label.length < 2 ||
      (['sources', 'entities', 'places'].includes(kind) && !subtype) ||
      (source && v.rights.trim().length < 3)
    ) {
      this.error.set(
        'Попълни името, задължителните за този вид полета и валиден URL идентификатор.',
      );
      return null;
    }
    const body: CatalogInput = { ...(v.slug ? { slug: v.slug.trim() } : {}) };
    if (source) {
      return {
        ...body,
        title: label,
        sourceType: subtype,
        ...(v.url.trim() ? { url: v.url.trim() } : {}),
        ...(v.relationId ? { archiveInstitutionId: v.relationId } : {}),
        originalInstitutionName: v.institution,
        archiveReference: {
          fund: v.fund,
          inventory: v.inventory,
          archiveUnit: v.archiveUnit,
          pageOrFrame: v.pageOrFrame,
        },
        rights: { publicDisplayAllowed: v.allowed, statement: v.rights.trim() },
        verification: { status: v.verification, note: v.verificationNote },
      };
    }
    body.name = label;
    body.aliases = v.aliases
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 100);
    switch (kind) {
      case 'topics':
        return { ...body, summary: v.description };
      case 'entities':
        return { ...body, entityType: subtype, summary: v.description };
      case 'places':
        return { ...body, placeType: subtype, ...(v.relationId ? { parentId: v.relationId } : {}) };
      case 'categories':
        return {
          ...body,
          description: v.description,
          isVisible: v.isVisible,
          ...(v.relationId ? { parentId: v.relationId } : {}),
        };
      case 'archive-institutions':
        return { ...body, ...(v.url.trim() ? { website: v.url.trim() } : {}) };
    }
  }

  private apply(response: StrictHttpResponse<CatalogDetail>): void {
    this.etag = response.headers.get('ETag');
    this.canSave.set(this.etag !== null);
    const entry = response.body;
    const fields: Record<string, unknown> = entry.fields;
    const archive = fieldsOf(fields['archiveReference']);
    const rights = fieldsOf(fields['rights']);
    const verification = fieldsOf(fields['verification']);
    const state = stringField(verification, 'status');
    const aliases: unknown = fields['aliases'];
    this.entry.set(entry);
    this.form.reset({
      label: entry.name,
      slug: entry.slug,
      description: stringField(fields, entry.kind === 'categories' ? 'description' : 'summary'),
      aliases: Array.isArray(aliases)
        ? aliases.filter((value): value is string => typeof value === 'string').join('\n')
        : '',
      subtype: stringField(
        fields,
        entry.kind === 'entities'
          ? 'entityType'
          : entry.kind === 'places'
            ? 'placeType'
            : 'sourceType',
      ),
      isVisible: fields['isVisible'] !== false,
      relationId: stringField(
        fields,
        entry.kind === 'sources' ? 'archiveInstitutionId' : 'parentId',
      ),
      url: stringField(fields, entry.kind === 'sources' ? 'url' : 'website'),
      institution: stringField(fields, 'originalInstitutionName'),
      fund: stringField(archive, 'fund'),
      inventory: stringField(archive, 'inventory'),
      archiveUnit: stringField(archive, 'archiveUnit'),
      pageOrFrame: stringField(archive, 'pageOrFrame'),
      allowed: rights?.['publicDisplayAllowed'] === true,
      rights: stringField(rights, 'statement'),
      verification: state === 'Verified' || state === 'Disputed' ? state : 'Unverified',
      verificationNote: stringField(verification, 'note'),
    });
    this.stale.set(false);
    this.closeActions();
  }

  private closeActions(): void {
    this.requested.set(null);
    this.reason.set('');
    this.merging.set(false);
    this.target.set(null);
    this.mergeReason.set('');
  }

  private async loadRelated(
    kind: CatalogSummary['kind'],
    id: string | null,
    request: number,
  ): Promise<void> {
    const relationKind = kind === 'sources' ? 'archive-institutions' : kind;
    if (kind !== 'sources' && kind !== 'categories' && kind !== 'places') return;
    try {
      const results = await firstValueFrom(this.api.listCatalogEntries({ kind: relationKind }));
      if (request !== this.loadNumber) return;
      const options = results.items.filter(
        (item) => item.id !== id && item.status !== 'Merged' && item.status !== 'Archived',
      );
      this.relatedOptions.set(options);
      if (kind === 'categories' && !id) {
        const parent = this.route.snapshot.queryParamMap.get('parentId');
        if (parent && options.some((option) => option.id === parent))
          this.form.controls.relationId.setValue(parent);
      }
    } catch {
      if (request === this.loadNumber) this.relatedFailure.set(true);
    }
  }

  private async loadMergeAccess(request: number): Promise<void> {
    this.administrator.set(false);
    if (!this.entry()?.allowedActions.includes('Merge')) return;
    try {
      const principal = await firstValueFrom(this.backOffice.getBackOfficePrincipal());
      if (this.loadNumber === request) this.administrator.set(principal.role === 'Administrator');
    } catch (error: unknown) {
      if (request === this.loadNumber) await this.access.redirectOnAccessError(error);
    }
  }

  private async run(operation: () => Promise<void>): Promise<void> {
    if (this.busy() || this.loading() || this.stale()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await operation();
    } catch (error: unknown) {
      await this.fail(error, 'Действието не можа да се изпълни. Провери полетата и опитай отново.');
    } finally {
      this.busy.set(false);
    }
  }

  private async fail(error: unknown, fallback: string): Promise<void> {
    const code = problemCode(error) ?? '';
    if (
      code !== 'catalog_merge_requires_administrator' &&
      (await this.access.redirectOnAccessError(error))
    )
      return;
    if (code === 'version_conflict' || code === 'catalog_entry_merged') this.stale.set(true);
    this.error.set(
      code === 'version_conflict'
        ? 'Записът е променен. Копирай локалните промени и зареди актуалната версия.'
        : (errors[code] ??
            (error instanceof HttpErrorResponse && error.status === 404
              ? 'Записът не е достъпен.'
              : actionError(error, fallback))),
    );
  }
}

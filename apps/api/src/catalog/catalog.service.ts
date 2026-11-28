import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, type ClientSession, mongo } from 'mongoose';
import { uuidv7 } from 'uuidv7';
import { AuditTargetType } from '../back-office/audit-event.types';
import { Role } from '../auth/persistence/account.schema';
import type { SignedInAccount } from '../auth/strategies/jwt.strategy';
import {
  PublishingAuditEvent,
  PublishingOutboxEvent,
} from '../publishing/persistence/publishing-event.schema';
import {
  type CatalogDetailDto,
  type CatalogInputDto,
  type CatalogMergeAcceptedDto,
  type CatalogMergeDto,
  type CatalogPageDto,
  type CatalogSummaryDto,
  type CatalogTransitionDto,
  type PublicCatalogDto,
} from './dto/catalog.dto';
import {
  CatalogEntry,
  CatalogKind,
  CatalogModelName,
  CatalogStatus,
  CatalogTransition,
} from './persistence/catalog.schema';

type Principal = SignedInAccount;

const authorCatalog = {
  categoryIds: {
    kind: CatalogKind.Categories,
    status: CatalogStatus.Approved,
    isVisible: true,
  },
  topicIds: { kind: CatalogKind.Topics, status: CatalogStatus.Published },
  placeIds: { kind: CatalogKind.Places, status: CatalogStatus.Published },
  sourceIds: { kind: CatalogKind.Sources, status: CatalogStatus.Active },
} as const;

export type AuthorCatalogField = keyof typeof authorCatalog;

const commonFields = ['slug', 'aliases'] as const;
const editableFields: Record<CatalogKind, readonly (keyof CatalogInputDto)[]> =
  {
    [CatalogKind.Topics]: [
      ...commonFields,
      'name',
      'summary',
      'categoryIds',
      'coverAssetId',
    ],
    [CatalogKind.Categories]: [
      ...commonFields,
      'name',
      'description',
      'parentId',
      'sortOrder',
      'icon',
      'isVisible',
    ],
    [CatalogKind.Entities]: [
      ...commonFields,
      'name',
      'entityType',
      'summary',
      'lifeSpan',
      'placeIds',
    ],
    [CatalogKind.Places]: [
      ...commonFields,
      'name',
      'placeType',
      'parentId',
      'location',
      'historicalNames',
    ],
    [CatalogKind.Sources]: [
      'slug',
      'title',
      'sourceType',
      'url',
      'rights',
      'verification',
      'archiveInstitutionId',
      'archiveReference',
      'originalInstitutionName',
    ],
    [CatalogKind.ArchiveInstitutions]: [
      ...commonFields,
      'name',
      'location',
      'website',
    ],
  };

@Injectable()
export class CatalogService {
  constructor(
    @InjectModel(CatalogModelName[CatalogKind.Topics])
    private readonly topics: Model<CatalogEntry>,
    @InjectModel(CatalogModelName[CatalogKind.Categories])
    private readonly categories: Model<CatalogEntry>,
    @InjectModel(CatalogModelName[CatalogKind.Entities])
    private readonly entities: Model<CatalogEntry>,
    @InjectModel(CatalogModelName[CatalogKind.Places])
    private readonly places: Model<CatalogEntry>,
    @InjectModel(CatalogModelName[CatalogKind.Sources])
    private readonly sources: Model<CatalogEntry>,
    @InjectModel(CatalogModelName[CatalogKind.ArchiveInstitutions])
    private readonly institutions: Model<CatalogEntry>,
    @InjectModel(PublishingAuditEvent.name)
    private readonly auditEvents: Model<PublishingAuditEvent>,
    @InjectModel(PublishingOutboxEvent.name)
    private readonly outboxEvents: Model<PublishingOutboxEvent>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  static etag(entry: CatalogDetailDto): string {
    return `"catalog-${entry.id}-v${entry.version}"`;
  }

  static versionFromEtag(id: string, value?: string): number {
    if (!value) {
      throw new HttpException(
        {
          code: 'precondition_required',
          message: 'The If-Match header is required.',
        },
        428,
      );
    }
    const prefix = `"catalog-${id}-v`;
    const versionText =
      value.startsWith(prefix) && value.endsWith('"')
        ? value.slice(prefix.length, -1)
        : '';
    if (!/^[1-9][0-9]*$/.test(versionText)) {
      throw new PreconditionFailedException({
        code: 'version_conflict',
        message: 'A current catalog ETag is required.',
      });
    }
    return Number(versionText);
  }

  async authorOptions(
    field: AuthorCatalogField,
    search: string,
    selectedIds: string[],
  ) {
    const { kind, ...visibility } = authorCatalog[field];
    const escaped = search
      .slice(0, 100)
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const labelField = field === 'sourceIds' ? 'title' : 'name';
    const model = this.model(kind);
    const projection = { _id: 1, [labelField]: 1 };
    const [entries, selected] = await Promise.all([
      model
        .find({
          ...visibility,
          [labelField]: { $regex: escaped, $options: 'i' },
        })
        .select(projection)
        .sort({ [labelField]: 1, _id: 1 })
        .limit(30)
        .exec(),
      selectedIds.length
        ? model
            .find({ ...visibility, _id: { $in: selectedIds } })
            .select(projection)
            .exec()
        : [],
    ]);
    return Array.from(
      new Map(
        [...entries, ...selected].map((entry) => [entry._id, entry]),
      ).values(),
    ).map((entry) => ({
      id: entry._id,
      label: entry[labelField]!,
    }));
  }

  async authorSelectionValid(
    field: AuthorCatalogField,
    ids: string[],
    session: ClientSession,
  ) {
    const { kind, ...visibility } = authorCatalog[field];
    const unique = [...new Set(ids)];
    const count = await this.model(kind)
      .countDocuments({ ...visibility, _id: { $in: unique } })
      .session(session)
      .exec();
    return count === unique.length;
  }

  async verifiedEpisodeSources(ids: string[], session?: ClientSession) {
    if (!ids.length) return [];
    const entries = await this.sources
      .find({
        _id: { $in: ids },
        status: CatalogStatus.Active,
        'verification.status': 'Verified',
        'rights.publicDisplayAllowed': true,
      })
      .select('title url archiveReference originalInstitutionName')
      .session(session ?? null)
      .exec();
    const byId = new Map(entries.map((entry) => [entry._id, entry]));
    return [...new Set(ids)].flatMap((id) => {
      const source = byId.get(id);
      if (!source?.title) return [];
      const archive = source.archiveReference;
      const reference = [
        source.originalInstitutionName,
        archive?.fund && `ф. ${archive.fund}`,
        archive?.inventory && `оп. ${archive.inventory}`,
        archive?.archiveUnit && `а.е. ${archive.archiveUnit}`,
        archive?.pageOrFrame && `л. ${archive.pageOrFrame}`,
      ]
        .filter(Boolean)
        .join(', ');
      const url = URL.canParse(source.url ?? '')
        ? new URL(source.url!)
        : undefined;
      return [
        {
          id,
          title: source.title,
          ...(url?.protocol === 'https:' && !url.username && !url.password
            ? { url: url.href }
            : {}),
          ...(reference ? { reference } : {}),
        },
      ];
    });
  }

  async list(
    kind: CatalogKind,
    query?: string,
    status?: CatalogStatus,
    parentId?: string,
  ): Promise<CatalogPageDto> {
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (parentId && kind === CatalogKind.Categories) filter.parentId = parentId;
    if (query) {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { title: { $regex: escaped, $options: 'i' } },
        { aliases: { $regex: escaped, $options: 'i' } },
      ];
    }
    const entries = await this.model(kind)
      .find(filter)
      .sort({ updatedAt: -1, _id: -1 })
      .limit(100)
      .exec();
    return { items: entries.map((entry) => this.summary(entry)) };
  }

  async create(
    principal: Principal,
    kind: CatalogKind,
    dto: CatalogInputDto,
    correlationId: string,
  ): Promise<CatalogDetailDto> {
    this.validateInput(kind, dto, true);
    const id = uuidv7();
    const now = new Date();
    try {
      await this.withTransaction(async (session) => {
        await this.validateRelations(kind, id, dto, session);
        await this.model(kind).create(
          [
            {
              _id: id,
              schemaVersion: 1,
              kind,
              createdByUserId: principal.profile.id,
              ...this.fields(kind, dto),
              slug: dto.slug ?? `catalog-${id}`,
              status: this.initialStatus(kind),
              version: 1,
              createdAt: now,
              updatedAt: now,
            },
          ],
          { session },
        );
        await this.record(
          id,
          1,
          'CatalogCreated',
          principal,
          correlationId,
          session,
          { kind },
        );
      });
    } catch (error: unknown) {
      this.rethrowDuplicate(error);
    }
    return this.get(kind, id);
  }

  async get(kind: CatalogKind, id: string): Promise<CatalogDetailDto> {
    const entry = await this.model(kind).findById(id).exec();
    if (!entry) throw this.notFound();
    return this.detail(entry);
  }

  async update(
    principal: Principal,
    kind: CatalogKind,
    id: string,
    expectedVersion: number,
    dto: CatalogInputDto,
    correlationId: string,
  ): Promise<CatalogDetailDto> {
    this.validateInput(kind, dto, false);
    try {
      await this.withTransaction(async (session) => {
        const entry = await this.model(kind)
          .findById(id)
          .session(session)
          .exec();
        if (!entry) throw this.notFound();
        if (entry.status === CatalogStatus.Merged) {
          throw new ConflictException({ code: 'catalog_entry_merged' });
        }
        this.requireVersion(entry, expectedVersion, true);
        await this.validateRelations(kind, id, dto, session);
        const result = await this.model(kind).updateOne(
          { _id: id, version: expectedVersion },
          {
            $set: {
              ...this.fields(kind, dto),
              updatedAt: new Date(),
            },
            $inc: { version: 1 },
          },
          { session },
        );
        if (!result.modifiedCount) this.versionConflict(true);
        await this.record(
          id,
          expectedVersion + 1,
          'CatalogUpdated',
          principal,
          correlationId,
          session,
          { kind, changedFields: Object.keys(dto) },
        );
      });
    } catch (error: unknown) {
      this.rethrowDuplicate(error);
    }
    return this.get(kind, id);
  }

  async transition(
    principal: Principal,
    kind: CatalogKind,
    id: string,
    dto: CatalogTransitionDto,
    correlationId: string,
  ): Promise<CatalogDetailDto> {
    await this.withTransaction(async (session) => {
      const entry = await this.model(kind).findById(id).session(session).exec();
      if (!entry) throw this.notFound();
      this.requireVersion(entry, dto.expectedVersion, false);
      this.requireReason(dto);
      const status = this.nextStatus(kind, entry.status, dto.action);
      const result = await this.model(kind).updateOne(
        { _id: id, version: dto.expectedVersion },
        {
          $set: { status, updatedAt: new Date() },
          $inc: { version: 1 },
        },
        { session },
      );
      if (!result.modifiedCount) this.versionConflict(false);
      await this.record(
        id,
        dto.expectedVersion + 1,
        `Catalog${dto.action}`,
        principal,
        correlationId,
        session,
        { kind, fromStatus: entry.status, toStatus: status },
        dto.reason,
      );
    });
    return this.get(kind, id);
  }

  async merge(
    principal: Principal,
    kind: CatalogKind,
    id: string,
    dto: CatalogMergeDto,
    correlationId: string,
  ): Promise<CatalogMergeAcceptedDto> {
    if (principal.profile.role !== Role.Administrator) {
      throw new ForbiddenException({
        code: 'catalog_merge_requires_administrator',
        message: 'Only an administrator can merge canonical catalog records.',
      });
    }
    if (![CatalogKind.Topics, CatalogKind.Categories].includes(kind)) {
      throw new UnprocessableEntityException({ code: 'merge_not_supported' });
    }
    if (id === dto.targetId) {
      throw new UnprocessableEntityException({
        code: 'merge_target_is_source',
      });
    }
    const operationId = uuidv7();
    await this.withTransaction(async (session) => {
      const model = this.model(kind);
      const source = await model.findById(id).session(session).exec();
      const target = await model.findById(dto.targetId).session(session).exec();
      if (!source || !target) throw this.notFound();
      this.requireVersion(source, dto.expectedVersion, false);
      this.requireVersion(target, dto.targetExpectedVersion, false);
      if (
        source.status === CatalogStatus.Merged ||
        target.status === CatalogStatus.Merged ||
        target.status === CatalogStatus.Rejected
      ) {
        throw new ConflictException({ code: 'invalid_merge_target' });
      }
      if (kind === CatalogKind.Categories) {
        await this.assertNotDescendant(id, dto.targetId, session);
      }
      const aliases = [
        ...new Set([
          ...(target.aliases ?? []),
          this.label(source),
          ...(source.aliases ?? []),
        ]),
      ];
      const sourceResult = await model.updateOne(
        { _id: id, version: dto.expectedVersion },
        {
          $set: {
            status: CatalogStatus.Merged,
            canonicalId: dto.targetId,
            updatedAt: new Date(),
          },
          $inc: { version: 1 },
        },
        { session },
      );
      const targetResult = await model.updateOne(
        { _id: dto.targetId, version: dto.targetExpectedVersion },
        {
          $set: { aliases, updatedAt: new Date() },
          $inc: { version: 1 },
        },
        { session },
      );
      if (!sourceResult.modifiedCount || !targetResult.modifiedCount) {
        this.versionConflict(false);
      }
      if (kind === CatalogKind.Categories) {
        await this.categories.updateMany(
          { parentId: id },
          { $set: { parentId: dto.targetId, updatedAt: new Date() } },
          { session },
        );
      }
      await this.record(
        id,
        dto.expectedVersion + 1,
        'CatalogMerged',
        principal,
        correlationId,
        session,
        { kind, sourceId: id, targetId: dto.targetId },
        dto.reason,
        operationId,
      );
      await this.record(
        dto.targetId,
        dto.targetExpectedVersion + 1,
        'CatalogMergeTargetSelected',
        principal,
        correlationId,
        session,
        { kind, sourceId: id, targetId: dto.targetId },
        dto.reason,
      );
    });
    return {
      operationId,
      statusUrl: `/api/admin/v1/operations/${operationId}`,
      sourceId: id,
      targetId: dto.targetId,
    };
  }

  async publicList(kind: CatalogKind, after?: string) {
    const visibility = this.publicVisibility(kind);
    const rows = await this.model(kind)
      .find({ ...visibility, ...(after ? { _id: { $gt: after } } : {}) })
      .sort({ _id: 1 })
      .limit(101)
      .exec();
    const items = rows.slice(0, 100).map((entry) => ({
      id: entry._id,
      kind,
      name: this.label(entry),
      slug: entry.slug,
    }));
    return { items, ...(rows.length > 100 ? { nextAfter: items[99].id } : {}) };
  }

  private publicVisibility(kind: CatalogKind) {
    if (kind === CatalogKind.Topics || kind === CatalogKind.Places) {
      return { status: CatalogStatus.Published };
    }
    if (kind === CatalogKind.Categories) {
      return { status: CatalogStatus.Approved, isVisible: true };
    }
    throw this.notFound();
  }

  async publicBySlug(
    kind: CatalogKind,
    slug: string,
  ): Promise<{ item?: PublicCatalogDto; redirectSlug?: string }> {
    this.publicVisibility(kind);
    const model = this.model(kind);
    let entry = await model.findOne({ slug }).exec();
    if (!entry) throw this.notFound();
    const seen = new Set<string>();
    while (entry.status === CatalogStatus.Merged && entry.canonicalId) {
      if (seen.has(entry._id) || seen.size >= 10) {
        throw new ConflictException({ code: 'catalog_merge_cycle' });
      }
      seen.add(entry._id);
      const canonical = await model.findById(entry.canonicalId).exec();
      if (!canonical) throw this.notFound();
      entry = canonical;
    }
    if (!this.isPublic(entry)) throw this.notFound();
    if (entry.slug !== slug) return { redirectSlug: entry.slug };
    return {
      item: {
        id: entry._id,
        kind,
        name: this.label(entry),
        slug: entry.slug,
        fields: this.publicFields(entry),
      },
    };
  }

  private model(kind: CatalogKind): Model<CatalogEntry> {
    switch (kind) {
      case CatalogKind.Topics:
        return this.topics;
      case CatalogKind.Categories:
        return this.categories;
      case CatalogKind.Entities:
        return this.entities;
      case CatalogKind.Places:
        return this.places;
      case CatalogKind.Sources:
        return this.sources;
      case CatalogKind.ArchiveInstitutions:
        return this.institutions;
    }
  }

  private validateInput(
    kind: CatalogKind,
    dto: CatalogInputDto,
    creating: boolean,
  ): void {
    const allowed = new Set(editableFields[kind]);
    const invalid = Object.keys(dto).filter(
      (key) =>
        dto[key as keyof CatalogInputDto] !== undefined &&
        !allowed.has(key as keyof CatalogInputDto),
    );
    if (invalid.length) {
      throw new UnprocessableEntityException({
        code: 'catalog_fields_invalid_for_kind',
        message: invalid.map((field) => `field_not_allowed:${field}`),
      });
    }
    if (!creating) return;
    const missing: string[] = [];
    if (kind === CatalogKind.Sources) {
      if (!dto.title) missing.push('title');
      if (!dto.sourceType) missing.push('sourceType');
      if (!dto.rights) missing.push('rights');
      if (!dto.verification) missing.push('verification');
    } else {
      if (!dto.name) missing.push('name');
      if (kind === CatalogKind.Entities && !dto.entityType)
        missing.push('entityType');
      if (kind === CatalogKind.Places && !dto.placeType)
        missing.push('placeType');
    }
    if (missing.length) {
      throw new UnprocessableEntityException({
        code: 'catalog_required_fields_missing',
        message: missing.map((field) => `field_required:${field}`),
      });
    }
  }

  private fields(
    kind: CatalogKind,
    dto: CatalogInputDto,
  ): Record<string, unknown> {
    return Object.fromEntries(
      editableFields[kind]
        .filter((field) => dto[field] !== undefined)
        .map((field) => [field, structuredClone(dto[field])]),
    );
  }

  private async validateRelations(
    kind: CatalogKind,
    id: string,
    dto: CatalogInputDto,
    session: ClientSession,
  ): Promise<void> {
    if (
      dto.parentId &&
      [CatalogKind.Categories, CatalogKind.Places].includes(kind)
    ) {
      await this.validateParent(kind, id, dto.parentId, session);
    }
    if (
      dto.lifeSpan?.fromYear !== undefined &&
      dto.lifeSpan.toYear !== undefined &&
      dto.lifeSpan.fromYear > dto.lifeSpan.toYear
    ) {
      throw new UnprocessableEntityException({ code: 'life_span_invalid' });
    }
    if (dto.archiveInstitutionId) {
      const institution = await this.institutions
        .findOne({
          _id: dto.archiveInstitutionId,
          status: { $ne: CatalogStatus.Archived },
        })
        .session(session)
        .exec();
      if (!institution) {
        throw new UnprocessableEntityException({
          code: 'archive_institution_invalid',
        });
      }
    }
  }

  private async validateParent(
    kind: CatalogKind,
    id: string,
    parentId: string,
    session: ClientSession,
  ): Promise<void> {
    if (id === parentId) {
      throw new UnprocessableEntityException({
        code: 'catalog_hierarchy_cycle',
      });
    }
    const model = this.model(kind);
    let currentId: string | undefined = parentId;
    const seen = new Set<string>([id]);
    for (let depth = 0; currentId; depth += 1) {
      if (seen.has(currentId)) {
        throw new UnprocessableEntityException({
          code: 'catalog_hierarchy_cycle',
        });
      }
      if (depth >= 8) {
        throw new UnprocessableEntityException({
          code: 'catalog_hierarchy_too_deep',
        });
      }
      seen.add(currentId);
      const parent = await model.findById(currentId).session(session).exec();
      if (!parent || parent.status === CatalogStatus.Merged) {
        throw new UnprocessableEntityException({
          code: 'catalog_parent_invalid',
        });
      }
      currentId = parent.parentId;
    }
  }

  private async assertNotDescendant(
    sourceId: string,
    targetId: string,
    session: ClientSession,
  ): Promise<void> {
    let currentId: string | undefined = targetId;
    const seen = new Set<string>();
    while (currentId) {
      if (currentId === sourceId || seen.has(currentId)) {
        throw new UnprocessableEntityException({
          code: 'catalog_hierarchy_cycle',
        });
      }
      seen.add(currentId);
      const entry = await this.categories
        .findById(currentId)
        .session(session)
        .exec();
      currentId = entry?.parentId;
    }
  }

  private initialStatus(kind: CatalogKind): CatalogStatus {
    switch (kind) {
      case CatalogKind.Categories:
        return CatalogStatus.Proposed;
      case CatalogKind.Sources:
      case CatalogKind.ArchiveInstitutions:
        return CatalogStatus.Active;
      default:
        return CatalogStatus.Draft;
    }
  }

  private nextStatus(
    kind: CatalogKind,
    status: CatalogStatus,
    action: CatalogTransition,
  ): CatalogStatus {
    const key = `${status}:${action}`;
    const transitions: Partial<
      Record<CatalogKind, Record<string, CatalogStatus>>
    > = {
      [CatalogKind.Topics]: {
        [`${CatalogStatus.Draft}:${CatalogTransition.Propose}`]:
          CatalogStatus.Proposed,
        [`${CatalogStatus.Proposed}:${CatalogTransition.Publish}`]:
          CatalogStatus.Published,
        [`${CatalogStatus.Published}:${CatalogTransition.Restrict}`]:
          CatalogStatus.Restricted,
        [`${CatalogStatus.Restricted}:${CatalogTransition.Restore}`]:
          CatalogStatus.Published,
        [`${CatalogStatus.Draft}:${CatalogTransition.Reject}`]:
          CatalogStatus.Rejected,
        [`${CatalogStatus.Proposed}:${CatalogTransition.Reject}`]:
          CatalogStatus.Rejected,
      },
      [CatalogKind.Categories]: {
        [`${CatalogStatus.Proposed}:${CatalogTransition.Approve}`]:
          CatalogStatus.Approved,
        [`${CatalogStatus.Approved}:${CatalogTransition.Hide}`]:
          CatalogStatus.Hidden,
        [`${CatalogStatus.Hidden}:${CatalogTransition.Restore}`]:
          CatalogStatus.Approved,
        [`${CatalogStatus.Proposed}:${CatalogTransition.Reject}`]:
          CatalogStatus.Rejected,
      },
      [CatalogKind.Entities]: this.publishableTransitions(),
      [CatalogKind.Places]: this.publishableTransitions(),
      [CatalogKind.Sources]: this.archivableTransitions(),
      [CatalogKind.ArchiveInstitutions]: this.archivableTransitions(),
    };
    const next = transitions[kind]?.[key];
    if (!next) {
      throw new ConflictException({ code: 'invalid_catalog_transition' });
    }
    return next;
  }

  private publishableTransitions(): Record<string, CatalogStatus> {
    return {
      [`${CatalogStatus.Draft}:${CatalogTransition.Publish}`]:
        CatalogStatus.Published,
      [`${CatalogStatus.Published}:${CatalogTransition.Hide}`]:
        CatalogStatus.Hidden,
      [`${CatalogStatus.Hidden}:${CatalogTransition.Restore}`]:
        CatalogStatus.Published,
    };
  }

  private archivableTransitions(): Record<string, CatalogStatus> {
    return {
      [`${CatalogStatus.Active}:${CatalogTransition.Archive}`]:
        CatalogStatus.Archived,
      [`${CatalogStatus.Archived}:${CatalogTransition.Restore}`]:
        CatalogStatus.Active,
    };
  }

  private requireReason(dto: CatalogTransitionDto): void {
    if (
      [
        CatalogTransition.Restrict,
        CatalogTransition.Reject,
        CatalogTransition.Hide,
        CatalogTransition.Archive,
        CatalogTransition.Restore,
      ].includes(dto.action) &&
      !dto.reason
    ) {
      throw new UnprocessableEntityException({ code: 'reason_required' });
    }
  }

  private summary(entry: CatalogEntry): CatalogSummaryDto {
    return {
      id: entry._id,
      kind: entry.kind,
      name: this.label(entry),
      slug: entry.slug,
      status: entry.status,
      ...(entry.canonicalId ? { canonicalId: entry.canonicalId } : {}),
      version: entry.version,
      updatedAtUtc: entry.updatedAt.toISOString(),
    };
  }

  private detail(entry: CatalogEntry): CatalogDetailDto {
    return {
      ...this.summary(entry),
      fields: this.outputFields(entry),
      allowedActions: this.allowedActions(entry),
    };
  }

  private outputFields(entry: CatalogEntry): Record<string, unknown> {
    const plain = (
      entry as CatalogEntry & { toObject(): Record<string, unknown> }
    ).toObject();
    const result: Record<string, unknown> = {};
    for (const field of editableFields[entry.kind]) {
      const value = plain[field];
      if (value !== undefined) result[field] = structuredClone(value);
    }
    return result;
  }

  private publicFields(entry: CatalogEntry): Record<string, unknown> {
    const fields = this.outputFields(entry);
    delete fields.isVisible;
    return fields;
  }

  private allowedActions(entry: CatalogEntry): string[] {
    const actions: string[] = Object.values(CatalogTransition).filter(
      (action) => {
        try {
          this.nextStatus(entry.kind, entry.status, action);
          return true;
        } catch {
          return false;
        }
      },
    );
    if (
      [CatalogKind.Topics, CatalogKind.Categories].includes(entry.kind) &&
      entry.status !== CatalogStatus.Merged
    ) {
      actions.push('Merge');
    }
    return actions;
  }

  private isPublic(entry: CatalogEntry): boolean {
    if (
      entry.kind === CatalogKind.Topics ||
      entry.kind === CatalogKind.Places
    ) {
      return entry.status === CatalogStatus.Published;
    }
    if (entry.kind === CatalogKind.Categories) {
      return (
        entry.status === CatalogStatus.Approved && entry.isVisible === true
      );
    }
    return false;
  }

  private label(entry: CatalogEntry): string {
    return entry.name ?? entry.title ?? entry.slug;
  }

  private requireVersion(
    entry: CatalogEntry,
    expected: number,
    precondition: boolean,
  ): void {
    if (entry.version !== expected) this.versionConflict(precondition);
  }

  private versionConflict(precondition: boolean): never {
    const payload = {
      code: 'version_conflict',
      message: 'Reload the catalog record before retrying the command.',
    };
    if (precondition) throw new PreconditionFailedException(payload);
    throw new ConflictException(payload);
  }

  private notFound(): NotFoundException {
    return new NotFoundException({ code: 'catalog_entry_not_found' });
  }

  private rethrowDuplicate(error: unknown): never | void {
    if (error instanceof mongo.MongoServerError && error.code === 11000) {
      throw new ConflictException({ code: 'catalog_slug_exists' });
    }
    throw error;
  }

  private async record(
    targetId: string,
    version: number,
    action: string,
    principal: Principal,
    correlationId: string,
    session: ClientSession,
    metadata: Record<string, unknown>,
    reason?: string,
    outboxId = uuidv7(),
  ): Promise<string> {
    const occurredAt = new Date();
    await this.auditEvents.create(
      [
        {
          _id: uuidv7(),
          schemaVersion: 1,
          actorId: principal.profile.id,
          actorRole: principal.profile.role,
          targetType: AuditTargetType.Catalog,
          action,
          targetId,
          targetVersion: version,
          ...(reason ? { reason } : {}),
          metadata,
          correlationId,
          occurredAt,
        },
      ],
      { session },
    );
    await this.outboxEvents.create(
      [
        {
          _id: outboxId,
          schemaVersion: 1,
          eventType: action,
          aggregateId: targetId,
          aggregateVersion: version,
          payload: { targetId, version, ...metadata },
          occurredAt,
        },
      ],
      { session },
    );
    return outboxId;
  }

  private async withTransaction<T>(
    operation: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    const session = await this.connection.startSession();
    try {
      let result: T | undefined;
      await session.withTransaction(async () => {
        result = await operation(session);
      });
      return result as T;
    } finally {
      await session.endSession();
    }
  }
}

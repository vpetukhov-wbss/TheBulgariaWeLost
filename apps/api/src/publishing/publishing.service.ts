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
import { Connection, Model, type ClientSession } from 'mongoose';
import { uuidv7 } from 'uuidv7';
import { AuditTargetType } from '../back-office/audit-event.types';
import { Role } from '../auth/persistence/account.schema';
import type { SignedInAccount } from '../auth/strategies/jwt.strategy';
import {
  CatalogService,
  type AuthorCatalogField,
} from '../catalog/catalog.service';
import {
  MediaAccessStatus,
  MediaUpload,
  ProcessingStatus,
  UploadStatus,
} from '../media/persistence/media-upload.schema';
import {
  MaterialDetailDto,
  MaterialPageDto,
  MaterialRevisionDetailDto,
  MaterialRevisionPageDto,
  MaterialRevisionSummaryDto,
  MaterialSummaryDto,
  MaterialTransition,
  PublicMaterialDto,
  type CreateMaterialDto,
  type RestoreMaterialRevisionDto,
  type TransitionMaterialDto,
  type UpdateMaterialDraftDto,
} from './dto/material.dto';
import {
  Material,
  type MaterialDraft,
  MaterialRevision,
  MaterialStatus,
  type MaterialType,
  WorkingStatus,
} from './persistence/material.schema';
import {
  PublishingAuditEvent,
  PublishingOutboxEvent,
} from './persistence/publishing-event.schema';

type Principal = SignedInAccount;
type ModerationAction =
  | 'RequestCorrection'
  | 'WithdrawMaterial'
  | 'RestoreMaterial';
const authorCatalogFields: AuthorCatalogField[] = [
  'categoryIds',
  'topicIds',
  'sourceIds',
];

@Injectable()
export class PublishingService {
  constructor(
    @InjectModel(Material.name) private readonly materials: Model<Material>,
    @InjectModel(MaterialRevision.name)
    private readonly revisions: Model<MaterialRevision>,
    @InjectModel(PublishingAuditEvent.name)
    private readonly auditEvents: Model<PublishingAuditEvent>,
    @InjectModel(PublishingOutboxEvent.name)
    private readonly outboxEvents: Model<PublishingOutboxEvent>,
    @InjectModel(MediaUpload.name)
    private readonly mediaUploads: Model<MediaUpload>,
    @InjectConnection() private readonly connection: Connection,
    private readonly catalog: CatalogService,
  ) {}

  static etag(material: MaterialDetailDto): string {
    return `"material-${material.id}-v${material.version}"`;
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
    const prefix = `"material-${id}-v`;
    const versionText =
      value.startsWith(prefix) && value.endsWith('"')
        ? value.slice(prefix.length, -1)
        : '';
    if (!/^[1-9][0-9]*$/.test(versionText)) {
      throw new PreconditionFailedException({
        code: 'version_conflict',
        message: 'A current material ETag is required.',
      });
    }
    return Number(versionText);
  }

  async list(
    principal: Principal,
    author = false,
    filters: {
      status?: MaterialStatus;
      workingStatus?: WorkingStatus;
      type?: MaterialType;
    } = {},
  ): Promise<MaterialPageDto> {
    const filter = author
      ? { authorId: principal.profile.id }
      : principal.profile.role === Role.Administrator
        ? {}
        : {
            $or: [
              { authorId: principal.profile.id },
              { hasBeenSubmitted: true },
            ],
          };
    const materials = await this.materials
      .find({
        ...filter,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.workingStatus
          ? { workingStatus: filters.workingStatus }
          : {}),
        ...(filters.type ? { type: filters.type } : {}),
      })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(100)
      .exec();
    const items = await Promise.all(
      materials.map(async (material) => {
        const revision = await this.currentRevision(material);
        return this.summary(material, revision.content.title);
      }),
    );
    return { items };
  }

  async create(
    principal: Principal,
    dto: CreateMaterialDto,
    correlationId: string,
    author = false,
  ): Promise<MaterialDetailDto> {
    const title = dto.title.trim();
    if (title.length < 3) {
      throw new UnprocessableEntityException({
        code: 'material_title_required',
      });
    }
    const materialId = uuidv7();
    const now = new Date();
    const content: MaterialDraft = {
      title,
      categoryIds: [],
      topicIds: [],
      sourceIds: [],
      mediaRefs: [],
      rights: { publicDisplayAllowed: false, statement: 'Not reviewed.' },
    };
    await this.withTransaction(async (session) => {
      await this.materials.create(
        [
          {
            _id: materialId,
            schemaVersion: 1,
            slug: `material-${materialId}`,
            type: dto.type,
            language: dto.language,
            authorId: principal.profile.id,
            status: MaterialStatus.Unpublished,
            workingStatus: WorkingStatus.Draft,
            workingRevisionNumber: 1,
            lastRevisionNumber: 1,
            hasBeenSubmitted: false,
            publicVisibility: false,
            version: 1,
            createdAt: now,
            updatedAt: now,
          },
        ],
        { session },
      );
      await this.createRevision(
        materialId,
        1,
        principal.profile.id,
        content,
        session,
        'Initial draft',
      );
      await this.record(
        materialId,
        1,
        'MaterialCreated',
        principal,
        correlationId,
        session,
      );
    });
    return this.get(principal, materialId, author);
  }

  async get(
    principal: Principal,
    id: string,
    author = false,
  ): Promise<MaterialDetailDto> {
    const material = await this.materials.findById(id).exec();
    this.requireAccess(material, principal, author);
    return this.detail(material!, author);
  }

  async updateDraft(
    principal: Principal,
    id: string,
    expectedVersion: number,
    dto: UpdateMaterialDraftDto,
    correlationId: string,
    author = false,
  ): Promise<MaterialDetailDto> {
    await this.withTransaction(async (session) => {
      const material = await this.materials
        .findById(id)
        .session(session)
        .exec();
      this.requireAccess(material, principal, author);
      this.requireVersion(material!, expectedVersion, true);
      if (author && !this.authorCanEdit(material!)) {
        throw new ConflictException({ code: 'material_locked_for_review' });
      }
      if (material!.status === MaterialStatus.Archived) {
        throw new ConflictException({
          code: 'material_archived',
          message: 'Restore the material from the archive before editing.',
        });
      }
      const current = await this.currentRevision(material!, session);
      const content = this.mergeDraft(current.content, dto);
      if (content.title.length < 3) {
        throw new UnprocessableEntityException({
          code: 'material_title_required',
        });
      }
      const revisionNumber = material!.lastRevisionNumber + 1;
      const nextVersion = material!.version + 1;
      const result = await this.materials.updateOne(
        { _id: id, version: expectedVersion },
        {
          $set: {
            workingRevisionNumber: revisionNumber,
            workingStatus:
              material!.publishedRevisionNumber && !material!.workingStatus
                ? WorkingStatus.InReview
                : material!.workingStatus,
            updatedAt: new Date(),
          },
          $inc: { lastRevisionNumber: 1, version: 1 },
        },
        { session },
      );
      if (!result.modifiedCount) this.versionConflict(true);
      await this.createRevision(
        id,
        revisionNumber,
        principal.profile.id,
        content,
        session,
        dto.changeSummary,
      );
      await this.record(
        id,
        nextVersion,
        'MaterialDraftUpdated',
        principal,
        correlationId,
        session,
      );
    });
    return this.get(principal, id, author);
  }

  async transition(
    principal: Principal,
    id: string,
    dto: TransitionMaterialDto,
    correlationId: string,
    author = false,
  ): Promise<MaterialDetailDto> {
    await this.withTransaction(async (session) => {
      const material = await this.materials
        .findById(id)
        .session(session)
        .exec();
      this.requireAccess(material, principal, author);
      this.requireVersion(material!, dto.expectedVersion, false);
      if (author) {
        if (dto.action !== MaterialTransition.SubmitForReview)
          this.invalidTransition();
        const revision = await this.currentRevision(material!, session);
        const blockers = await this.authorBlockers(revision.content, session);
        if (blockers.length) {
          throw new UnprocessableEntityException({
            code: 'submission_incomplete',
            message: blockers,
          });
        }
      }
      this.requireReason(dto);
      const updates = await this.transitionUpdates(material!, dto, session);
      const nextVersion = material!.version + 1;
      const result = await this.materials.updateOne(
        { _id: id, version: dto.expectedVersion },
        {
          $set: { ...updates.set, updatedAt: new Date() },
          ...(updates.unset ? { $unset: updates.unset } : {}),
          ...(updates.revisionCreated
            ? { $inc: { lastRevisionNumber: 1, version: 1 } }
            : { $inc: { version: 1 } }),
        },
        { session },
      );
      if (!result.modifiedCount) this.versionConflict(false);
      if (updates.revisionCreated) {
        await this.createRevision(
          id,
          material!.lastRevisionNumber + 1,
          principal.profile.id,
          updates.revisionCreated.content,
          session,
          dto.reason,
          updates.revisionCreated.restoredFrom,
        );
      }
      await this.record(
        id,
        nextVersion,
        `Material${dto.action}`,
        principal,
        correlationId,
        session,
        dto.reason,
      );
    });
    return this.get(principal, id, author);
  }

  async revisionsFor(
    principal: Principal,
    id: string,
  ): Promise<MaterialRevisionPageDto> {
    const material = await this.materials.findById(id).exec();
    this.requireAccess(material, principal);
    const revisions = await this.revisions
      .find({ materialId: id })
      .sort({ revisionNumber: -1 })
      .limit(100)
      .exec();
    return {
      items: revisions.map((revision) => this.revisionSummary(revision)),
    };
  }

  async revision(
    principal: Principal,
    id: string,
    number: number,
  ): Promise<MaterialRevisionDetailDto> {
    const material = await this.materials.findById(id).exec();
    this.requireAccess(material, principal);
    const revision = await this.revisions
      .findOne({ materialId: id, revisionNumber: number })
      .exec();
    if (!revision) {
      throw new NotFoundException({ code: 'revision_not_found' });
    }
    return { ...this.revisionSummary(revision), content: revision.content };
  }

  async restoreRevision(
    principal: Principal,
    id: string,
    dto: RestoreMaterialRevisionDto,
    correlationId: string,
  ): Promise<MaterialDetailDto> {
    await this.withTransaction(async (session) => {
      const material = await this.materials
        .findById(id)
        .session(session)
        .exec();
      this.requireAccess(material, principal);
      this.requireVersion(material!, dto.expectedVersion, false);
      if (material!.status === MaterialStatus.Archived) {
        throw new ConflictException({
          code: 'material_archived',
          message: 'Restore the material from the archive first.',
        });
      }
      const source = await this.revisions
        .findOne({ materialId: id, revisionNumber: dto.revisionNumber })
        .session(session)
        .exec();
      if (!source) {
        throw new NotFoundException({ code: 'revision_not_found' });
      }
      const revisionNumber = material!.lastRevisionNumber + 1;
      const nextVersion = material!.version + 1;
      const result = await this.materials.updateOne(
        { _id: id, version: dto.expectedVersion },
        {
          $set: {
            workingRevisionNumber: revisionNumber,
            workingStatus: WorkingStatus.InReview,
            updatedAt: new Date(),
          },
          $inc: { lastRevisionNumber: 1, version: 1 },
        },
        { session },
      );
      if (!result.modifiedCount) this.versionConflict(false);
      await this.createRevision(
        id,
        revisionNumber,
        principal.profile.id,
        structuredClone(source.content),
        session,
        dto.reason,
        dto.revisionNumber,
      );
      await this.record(
        id,
        nextVersion,
        'MaterialRevisionRestored',
        principal,
        correlationId,
        session,
        dto.reason,
      );
    });
    return this.get(principal, id);
  }

  async publicBySlug(slug: string): Promise<PublicMaterialDto> {
    return this.publicMaterial({ slug });
  }

  async publicById(id: string): Promise<PublicMaterialDto> {
    return this.publicMaterial({ _id: id });
  }

  async moderationTarget(id: string, session?: ClientSession) {
    const query = this.materials.findById(id);
    if (session) query.session(session);
    const material = await query.exec();
    if (!material?.publishedRevisionNumber) this.publicNotFound();
    return {
      id: material._id,
      slug: material.slug,
      status: material.status,
      version: material.version,
      revisionNumber: material.publishedRevisionNumber,
      publicVisibility: material.publicVisibility,
      holdCaseId: material.moderationCaseId,
    };
  }

  async moderate(
    principal: Principal,
    id: string,
    caseId: string,
    action: ModerationAction,
    expectedVersion: number,
    reason: string,
    correlationId: string,
    session: ClientSession,
  ): Promise<void> {
    if (![Role.Editor, Role.Administrator].includes(principal.profile.role)) {
      throw new ForbiddenException({ code: 'forbidden' });
    }
    const material = await this.materials.findById(id).session(session).exec();
    if (!material?.publishedRevisionNumber) this.publicNotFound();
    this.requireVersion(material, expectedVersion, false);

    let set: Record<string, unknown>;
    let unset: Record<string, 1> | undefined;
    if (action === 'RestoreMaterial') {
      if (
        material.status !== MaterialStatus.Withdrawn ||
        material.moderationCaseId !== caseId
      ) {
        this.invalidTransition();
      }
      const revision = await this.revisions
        .findOne({
          materialId: id,
          revisionNumber: material.publishedRevisionNumber,
        })
        .session(session)
        .exec();
      if (!revision)
        throw new NotFoundException({ code: 'revision_not_found' });
      const blockers = await this.publicationBlockers(
        revision.content,
        session,
      );
      if (blockers.length)
        throw new UnprocessableEntityException({
          code: 'publication_rights_missing',
          message: blockers,
        });
      set = { status: MaterialStatus.Published, publicVisibility: true };
      unset = { moderationCaseId: 1 };
    } else {
      if (
        material.status !== MaterialStatus.Published ||
        !material.publicVisibility
      ) {
        this.invalidTransition();
      }
      set =
        action === 'WithdrawMaterial'
          ? {
              status: MaterialStatus.Withdrawn,
              publicVisibility: false,
              moderationCaseId: caseId,
            }
          : {
              workingStatus: WorkingStatus.ChangesRequested,
              workingRevisionNumber:
                material.workingRevisionNumber ??
                material.publishedRevisionNumber,
              correctionNote: reason,
              hasBeenSubmitted: true,
            };
    }
    const update = await this.materials
      .updateOne(
        { _id: id, version: expectedVersion },
        {
          $set: { ...set, updatedAt: new Date() },
          ...(unset ? { $unset: unset } : {}),
          $inc: { version: 1 },
        },
        { session },
      )
      .exec();
    if (update.modifiedCount !== 1) this.versionConflict(false);
    const events = {
      RequestCorrection: 'MaterialModerationChangesRequested',
      WithdrawMaterial: 'MaterialModerationWithdrawn',
      RestoreMaterial: 'MaterialModerationRestored',
    };
    await this.record(
      id,
      expectedVersion + 1,
      events[action],
      principal,
      correlationId,
      session,
      reason,
      { moderationCaseId: caseId },
    );
  }

  private async publicMaterial(
    identity: { slug: string } | { _id: string },
  ): Promise<PublicMaterialDto> {
    const material = await this.materials
      .findOne({
        ...identity,
        status: MaterialStatus.Published,
        publicVisibility: true,
      })
      .exec();
    if (!material?.publishedRevisionNumber) this.publicNotFound();
    const revision = await this.revisions
      .findOne({
        materialId: material!._id,
        revisionNumber: material!.publishedRevisionNumber,
      })
      .exec();
    if (!revision || (await this.mediaBlockers(revision.content)).length) {
      this.publicNotFound();
    }
    return {
      id: material!._id,
      slug: material!.slug,
      type: material!.type,
      language: material!.language,
      revisionNumber: material!.publishedRevisionNumber!,
      content: revision!.content,
    };
  }

  private async transitionUpdates(
    material: Material,
    dto: TransitionMaterialDto,
    session: ClientSession,
  ): Promise<{
    set: Record<string, unknown>;
    unset?: Record<string, 1>;
    revisionCreated?: {
      content: MaterialDraft;
      restoredFrom: number;
    };
  }> {
    if (
      material.moderationCaseId &&
      [MaterialTransition.Publish, MaterialTransition.Archive].includes(
        dto.action,
      )
    ) {
      throw new ConflictException({ code: 'moderation_hold' });
    }
    switch (dto.action) {
      case MaterialTransition.SubmitForReview:
        this.requireWorkingStatus(material, [
          WorkingStatus.Draft,
          WorkingStatus.ChangesRequested,
        ]);
        return {
          set: {
            workingStatus: WorkingStatus.Submitted,
            hasBeenSubmitted: true,
          },
          unset: { correctionNote: 1 },
        };
      case MaterialTransition.StartReview:
        this.requireWorkingStatus(material, [WorkingStatus.Submitted]);
        return { set: { workingStatus: WorkingStatus.InReview } };
      case MaterialTransition.RequestChanges:
        this.requireWorkingStatus(material, [WorkingStatus.InReview]);
        return {
          set: {
            workingStatus: WorkingStatus.ChangesRequested,
            correctionNote: dto.reason,
          },
        };
      case MaterialTransition.Publish: {
        this.requireWorkingStatus(material, [WorkingStatus.InReview]);
        const revision = await this.currentRevision(material, session);
        const blockers = await this.publicationBlockers(
          revision.content,
          session,
        );
        if (blockers.length) {
          throw new UnprocessableEntityException({
            code: 'publication_rights_missing',
            message: blockers,
          });
        }
        return {
          set: {
            status: MaterialStatus.Published,
            publicVisibility: true,
            publishedRevisionNumber: material.workingRevisionNumber,
          },
          unset: { workingStatus: 1, workingRevisionNumber: 1 },
        };
      }
      case MaterialTransition.Withdraw:
        if (material.status !== MaterialStatus.Published) {
          this.invalidTransition();
        }
        return {
          set: {
            status: MaterialStatus.Withdrawn,
            publicVisibility: false,
          },
        };
      case MaterialTransition.Archive:
        if (material.status === MaterialStatus.Archived)
          this.invalidTransition();
        return {
          set: {
            archivedFromStatus: material.status,
            ...(material.workingStatus
              ? { archivedFromWorkingStatus: material.workingStatus }
              : {}),
            status: MaterialStatus.Archived,
            publicVisibility: false,
          },
          unset: { workingStatus: 1 },
        };
      case MaterialTransition.RestoreFromArchive: {
        if (material.status !== MaterialStatus.Archived) {
          this.invalidTransition();
        }
        const source = await this.currentRevision(material, session);
        const revisionNumber = material.lastRevisionNumber + 1;
        return {
          set: {
            status: material.publishedRevisionNumber
              ? MaterialStatus.Withdrawn
              : MaterialStatus.Unpublished,
            publicVisibility: false,
            workingStatus: WorkingStatus.InReview,
            workingRevisionNumber: revisionNumber,
          },
          unset: { archivedFromStatus: 1, archivedFromWorkingStatus: 1 },
          revisionCreated: {
            content: structuredClone(source.content),
            restoredFrom: source.revisionNumber,
          },
        };
      }
    }
  }

  private async detail(
    material: Material,
    author = false,
  ): Promise<MaterialDetailDto> {
    const revision = await this.currentRevision(material);
    return {
      id: material._id,
      slug: material.slug,
      type: material.type,
      language: material.language,
      authorId: material.authorId,
      status: material.status,
      ...(material.workingStatus
        ? { workingStatus: material.workingStatus }
        : {}),
      ...(material.workingRevisionNumber
        ? { workingRevisionNumber: material.workingRevisionNumber }
        : {}),
      ...(material.publishedRevisionNumber
        ? { publishedRevisionNumber: material.publishedRevisionNumber }
        : {}),
      publicVisibility: material.publicVisibility,
      draft: revision.content,
      allowedActions: author
        ? this.authorCanEdit(material)
          ? [MaterialTransition.SubmitForReview]
          : []
        : this.allowedActions(material),
      publicationBlockers: author
        ? await this.authorBlockers(revision.content)
        : await this.publicationBlockers(revision.content),
      ...(material.workingStatus === WorkingStatus.ChangesRequested &&
      material.correctionNote
        ? { correctionNote: material.correctionNote }
        : {}),
      version: material.version,
      updatedAtUtc: material.updatedAt.toISOString(),
    };
  }

  private summary(material: Material, title: string): MaterialSummaryDto {
    return {
      id: material._id,
      slug: material.slug,
      title,
      type: material.type,
      status: material.status,
      ...(material.workingStatus
        ? { workingStatus: material.workingStatus }
        : {}),
      version: material.version,
      updatedAtUtc: material.updatedAt.toISOString(),
    };
  }

  private revisionSummary(
    revision: MaterialRevision,
  ): MaterialRevisionSummaryDto {
    return {
      materialId: revision.materialId,
      revisionNumber: revision.revisionNumber,
      createdAtUtc: revision.createdAt.toISOString(),
      createdByUserId: revision.createdByUserId,
      ...(revision.changeSummary
        ? { changeSummary: revision.changeSummary }
        : {}),
      ...(revision.restoredFromRevisionNumber
        ? { restoredFromRevisionNumber: revision.restoredFromRevisionNumber }
        : {}),
    };
  }

  private async currentRevision(
    material: Material,
    session?: ClientSession,
  ): Promise<MaterialRevision> {
    const number =
      material.workingRevisionNumber ?? material.publishedRevisionNumber;
    if (!number) throw new NotFoundException({ code: 'revision_not_found' });
    const query = this.revisions.findOne({
      materialId: material._id,
      revisionNumber: number,
    });
    if (session) query.session(session);
    const revision = await query.exec();
    if (!revision) throw new NotFoundException({ code: 'revision_not_found' });
    return revision;
  }

  private mergeDraft(
    current: MaterialDraft,
    update: UpdateMaterialDraftDto,
  ): MaterialDraft {
    const changes = { ...update };
    delete changes.changeSummary;
    return {
      ...structuredClone(current),
      ...changes,
      title: (update.title ?? current.title).trim(),
      blocks: update.blocks ?? current.blocks,
      rights: update.rights ?? current.rights,
      mediaRefs: update.mediaRefs ?? current.mediaRefs,
      categoryIds: update.categoryIds ?? current.categoryIds,
      topicIds: update.topicIds ?? current.topicIds,
      sourceIds: update.sourceIds ?? current.sourceIds,
    };
  }

  private async publicationBlockers(
    draft: MaterialDraft,
    session?: ClientSession,
  ): Promise<string[]> {
    const blockers: string[] = [];
    if (!draft.categoryIds.length) blockers.push('category_required');
    if (!draft.topicIds.length) blockers.push('topic_required');
    if (!draft.sourceIds.length) blockers.push('source_required');
    if (!draft.rights.publicDisplayAllowed)
      blockers.push('material_rights_missing');
    blockers.push(...(await this.mediaBlockers(draft, session)));
    return blockers;
  }

  private async authorBlockers(
    draft: MaterialDraft,
    session?: ClientSession,
  ): Promise<string[]> {
    const blockers = await this.publicationBlockers(draft, session);
    if (draft.title.trim().length < 3) blockers.push('material_title_required');
    const blocks = draft.blocks ?? [];
    if (!draft.body?.trim() && !blocks.some((block) => block.text.trim())) {
      blockers.push('content_required');
    } else if (blocks.some((block) => !block.text.trim())) {
      blockers.push('empty_block');
    }
    const rightsStatement = draft.rights.statement.trim();
    if (
      draft.rights.publicDisplayAllowed &&
      (rightsStatement.length < 3 ||
        rightsStatement === 'Not reviewed.' ||
        rightsStatement === 'Не са потвърдени.')
    )
      blockers.push('rights_statement_required');
    if (session) {
      for (const field of authorCatalogFields) {
        if (
          draft[field].length &&
          !(await this.catalog.authorSelectionValid(
            field,
            draft[field],
            session,
          ))
        ) {
          blockers.push(`catalog_selection_unavailable:${field}`);
        }
      }
    }
    return blockers;
  }

  private authorCanEdit(material: Material): boolean {
    return (
      material.status !== MaterialStatus.Archived &&
      (material.workingStatus === WorkingStatus.Draft ||
        material.workingStatus === WorkingStatus.ChangesRequested)
    );
  }

  private async mediaBlockers(
    draft: MaterialDraft,
    session?: ClientSession,
  ): Promise<string[]> {
    const ids = [
      ...new Set(draft.mediaRefs.map((reference) => reference.mediaId)),
    ];
    if (!ids.length) return [];
    const query = this.mediaUploads.find({ _id: { $in: ids } });
    if (session) query.session(session);
    const media = await query.exec();
    const valid = new Set(
      media
        .filter(
          (asset) =>
            asset.status === UploadStatus.Completed &&
            asset.processingStatus === ProcessingStatus.Ready &&
            asset.accessStatus === MediaAccessStatus.Active &&
            Boolean(asset.rightsEvidence?.trim()),
        )
        .map((asset) => asset._id),
    );
    return ids
      .filter((id) => !valid.has(id))
      .map((id) => `media_rights_missing:${id}`);
  }

  private allowedActions(material: Material): string[] {
    if (material.status === MaterialStatus.Archived) {
      return [MaterialTransition.RestoreFromArchive];
    }
    const actions = material.moderationCaseId
      ? []
      : [MaterialTransition.Archive];
    if (
      material.workingStatus === WorkingStatus.Draft ||
      material.workingStatus === WorkingStatus.ChangesRequested
    ) {
      actions.push(MaterialTransition.SubmitForReview);
    }
    if (material.workingStatus === WorkingStatus.Submitted) {
      actions.push(MaterialTransition.StartReview);
    }
    if (material.workingStatus === WorkingStatus.InReview) {
      actions.push(MaterialTransition.RequestChanges);
      if (!material.moderationCaseId) actions.push(MaterialTransition.Publish);
    }
    if (material.status === MaterialStatus.Published) {
      actions.push(MaterialTransition.Withdraw);
    }
    return actions;
  }

  private requireAccess(
    material: Material | null,
    principal: Principal,
    author = false,
  ): void {
    if (
      !material ||
      (author && material.authorId !== principal.profile.id) ||
      (principal.profile.role !== Role.Administrator &&
        material.authorId !== principal.profile.id &&
        !material.hasBeenSubmitted)
    ) {
      throw new NotFoundException({ code: 'material_not_found' });
    }
  }

  private requireVersion(
    material: Material,
    expected: number,
    precondition: boolean,
  ): void {
    if (material.version !== expected) this.versionConflict(precondition);
  }

  private versionConflict(precondition: boolean): never {
    const payload = {
      code: 'version_conflict',
      message: 'Reload the current material and review its latest revision.',
    };
    if (precondition) throw new PreconditionFailedException(payload);
    throw new ConflictException(payload);
  }

  private requireWorkingStatus(
    material: Material,
    expected: WorkingStatus[],
  ): void {
    if (!material.workingStatus || !expected.includes(material.workingStatus)) {
      this.invalidTransition();
    }
  }

  private invalidTransition(): never {
    throw new ConflictException({
      code: 'invalid_material_transition',
      message: 'The material is not in a state that allows this action.',
    });
  }

  private requireReason(dto: TransitionMaterialDto): void {
    if (
      [
        MaterialTransition.RequestChanges,
        MaterialTransition.Withdraw,
        MaterialTransition.Archive,
        MaterialTransition.RestoreFromArchive,
      ].includes(dto.action) &&
      !dto.reason
    ) {
      throw new UnprocessableEntityException({
        code: 'reason_required',
        message: 'A reason is required for this transition.',
      });
    }
  }

  private async createRevision(
    materialId: string,
    revisionNumber: number,
    actorId: string,
    content: MaterialDraft,
    session: ClientSession,
    changeSummary?: string,
    restoredFromRevisionNumber?: number,
  ): Promise<void> {
    await this.revisions.create(
      [
        {
          _id: uuidv7(),
          schemaVersion: 1,
          materialId,
          revisionNumber,
          createdByUserId: actorId,
          ...(changeSummary ? { changeSummary } : {}),
          ...(restoredFromRevisionNumber ? { restoredFromRevisionNumber } : {}),
          content,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      { session },
    );
  }

  private async record(
    materialId: string,
    version: number,
    action: string,
    principal: Principal,
    correlationId: string,
    session: ClientSession,
    reason?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const occurredAt = new Date();
    await this.auditEvents.create(
      [
        {
          _id: uuidv7(),
          schemaVersion: 1,
          actorId: principal.profile.id,
          actorRole: principal.profile.role,
          targetType: AuditTargetType.Material,
          action,
          targetId: materialId,
          targetVersion: version,
          ...(reason ? { reason } : {}),
          ...(metadata ? { metadata } : {}),
          correlationId,
          occurredAt,
        },
      ],
      { session },
    );
    await this.outboxEvents.create(
      [
        {
          _id: uuidv7(),
          schemaVersion: 1,
          eventType: action,
          aggregateId: materialId,
          aggregateVersion: version,
          payload: { materialId, version, ...metadata },
          occurredAt,
        },
      ],
      { session },
    );
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

  private publicNotFound(): never {
    throw new NotFoundException({ code: 'material_not_found' });
  }
}

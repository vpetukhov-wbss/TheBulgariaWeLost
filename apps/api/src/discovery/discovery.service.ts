import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { isUUID } from 'class-validator';
import { Model } from 'mongoose';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import type { AllConfigType } from '../config/config.type';
import {
  Material,
  MaterialRevision,
  MaterialStatus,
} from '../publishing/persistence/material.schema';
import { PublishingOutboxEvent } from '../publishing/persistence/publishing-event.schema';
import { PublishingService } from '../publishing/publishing.service';
import type {
  ArchiveSearchItem,
  ArchiveSearchPage,
  ArchiveSearchQuery,
  RebuildSearchResult,
  SearchMetrics,
} from './discovery.dto';
import { SearchIndex, type SearchPosition } from './search-index';

const materialEvents = { 'payload.materialId': { $exists: true } };
const pending = { ...materialEvents, searchProjectedAt: { $exists: false } };
const batchSize = 20;

@Injectable()
export class DiscoveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiscoveryService.name);
  private timer?: NodeJS.Timeout;
  private work?: Promise<void>;
  private readonly cursorKey: Buffer;

  constructor(
    @InjectModel(Material.name) private readonly materials: Model<Material>,
    @InjectModel(MaterialRevision.name)
    private readonly revisions: Model<MaterialRevision>,
    @InjectModel(PublishingOutboxEvent.name)
    private readonly events: Model<PublishingOutboxEvent>,
    private readonly publishing: PublishingService,
    private readonly index: SearchIndex,
    config: ConfigService<AllConfigType>,
  ) {
    this.cursorKey = createHash('sha256')
      .update('archive-search-cursor-v1\0')
      .update(config.getOrThrow('auth.secret', { infer: true }))
      .digest();
  }

  onModuleInit(): void {
    if (!this.index.enabled) return;
    this.timer = setInterval(() => {
      if (this.work) return;
      this.work = this.consume()
        .catch(() => {
          this.logger.warn('Archive search outbox is temporarily unavailable.');
        })
        .finally(() => {
          this.work = undefined;
        });
    }, 2_000);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.work;
  }

  async search(query: ArchiveSearchQuery): Promise<ArchiveSearchPage> {
    const limit = query.limit ?? 20;
    const terms = {
      type: query.type,
      language: query.language,
      topicIds: query.topicId,
      categoryIds: query.categoryId,
    };
    const scope = createHash('sha256')
      .update(JSON.stringify([query.q ?? '', terms]))
      .digest('base64url');
    let after = this.position(query.cursor, scope);
    const items: ArchiveSearchItem[] = [];
    const filters = Object.entries(terms)
      .filter(([, value]) => Boolean(value))
      .map(([field, value]) => ({ term: { [field]: value } }));
    // Cap hydration work on pages containing many obsolete index documents.
    const size = Math.max(20, limit);
    for (let batch = 0; batch < 4; batch++) {
      const hits = await this.index.search(filters, query.q, size, after);
      for (const hit of hits) {
        after = hit.sort;
        const item = await this.hydrate(hit._id, hit._source.revision, query);
        if (item) items.push(item);
        if (items.length === limit) {
          const hasMore = hit !== hits[hits.length - 1] || hits.length === size;
          return {
            items,
            ...(hasMore ? { nextCursor: this.cursor(scope, after) } : {}),
          };
        }
      }
      if (hits.length < size) return { items };
    }
    return {
      items,
      ...(after ? { nextCursor: this.cursor(scope, after) } : {}),
    };
  }

  async rebuild(after?: string): Promise<RebuildSearchResult> {
    await this.index.prepare();
    const rows = await this.materials
      .find(after ? { _id: { $gt: after } } : {})
      .sort({ _id: 1 })
      .limit(batchSize + 1)
      .lean()
      .exec();
    const slice = rows.slice(0, batchSize);
    for (let start = 0; start < slice.length; start += 5) {
      await Promise.all(
        slice.slice(start, start + 5).map((material) => this.project(material)),
      );
    }
    return {
      processed: slice.length,
      ...(rows.length > batchSize
        ? { nextAfter: slice[slice.length - 1]._id }
        : {}),
    };
  }

  async metrics(): Promise<SearchMetrics> {
    const [total, retrying, oldest, latest] = await Promise.all([
      this.events.countDocuments(pending).exec(),
      this.events
        .countDocuments({ ...pending, searchFailures: { $gt: 0 } })
        .exec(),
      this.events
        .findOne(pending)
        .sort({ occurredAt: 1, _id: 1 })
        .lean()
        .exec(),
      this.events
        .findOne({ searchProjectedAt: { $exists: true } })
        .sort({ searchProjectedAt: -1 })
        .lean()
        .exec(),
    ]);
    return {
      enabled: this.index.enabled,
      pending: total,
      retrying,
      ...(oldest
        ? { oldestPendingAtUtc: oldest.occurredAt.toISOString() }
        : {}),
      ...(latest?.searchProjectedAt
        ? { lastProjectedAtUtc: latest.searchProjectedAt.toISOString() }
        : {}),
    };
  }

  private async consume(): Promise<void> {
    for (let count = 0; count < batchSize; count++) {
      const now = new Date();
      const token = randomUUID();
      const event = await this.events
        .findOneAndUpdate(
          {
            ...pending,
            $or: [
              { searchAvailableAt: { $exists: false } },
              { searchAvailableAt: { $lte: now } },
            ],
          },
          {
            $set: {
              searchLease: token,
              searchAvailableAt: new Date(now.getTime() + 30_000),
            },
          },
          { new: true, sort: { occurredAt: 1, _id: 1 } },
        )
        .lean()
        .exec();
      if (!event) return;
      const claim = { _id: event._id, searchLease: token };
      try {
        const material = await this.materials
          .findById(event.aggregateId)
          .lean()
          .exec();
        if (material) await this.project(material);
        await this.events
          .updateOne(claim, {
            $set: { searchProjectedAt: new Date() },
            $unset: { searchLease: 1, searchAvailableAt: 1 },
          })
          .exec();
      } catch {
        const delay = Math.min(
          300_000,
          5_000 * 2 ** Math.min(event.searchFailures ?? 0, 6),
        );
        await this.events
          .updateOne(claim, {
            $inc: { searchFailures: 1 },
            $set: { searchAvailableAt: new Date(Date.now() + delay) },
            $unset: { searchLease: 1 },
          })
          .exec();
      }
    }
  }

  private async project(material: Material): Promise<void> {
    const revision =
      material.status === MaterialStatus.Published &&
      material.publicVisibility &&
      material.publishedRevisionNumber
        ? await this.revisions
            .findOne({
              materialId: material._id,
              revisionNumber: material.publishedRevisionNumber,
            })
            .lean()
            .exec()
        : null;
    const content = revision?.content;
    if (!content?.rights.publicDisplayAllowed) {
      await this.index.project(material._id, material.version, {
        visible: false,
      });
      return;
    }
    await this.index.project(material._id, material.version, {
      visible: true,
      revision: material.publishedRevisionNumber,
      title: content.title,
      summary: content.summary ?? '',
      body: [
        content.subtitle,
        content.body,
        ...(content.blocks ?? []).map(({ text }) => text),
      ]
        .filter(Boolean)
        .join('\n'),
      type: material.type,
      language: material.language,
      categoryIds: content.categoryIds,
      topicIds: content.topicIds,
    });
  }

  private async hydrate(
    id: string,
    revision: number,
    query: ArchiveSearchQuery,
  ): Promise<ArchiveSearchItem | undefined> {
    if (!isUUID(id, '7')) return undefined;
    try {
      const material = await this.publishing.publicById(id);
      const { content } = material;
      if (
        material.revisionNumber !== revision ||
        !content.rights.publicDisplayAllowed ||
        (query.type && material.type !== query.type) ||
        (query.language && material.language !== query.language) ||
        (query.topicId && !content.topicIds.includes(query.topicId)) ||
        (query.categoryId && !content.categoryIds.includes(query.categoryId))
      )
        return undefined;
      return {
        id,
        slug: material.slug,
        type: material.type,
        language: material.language,
        title: content.title,
        ...(content.summary ? { summary: content.summary } : {}),
      };
    } catch (error: unknown) {
      if (error instanceof NotFoundException) return undefined;
      throw error;
    }
  }

  private position(
    value: string | undefined,
    scope: string,
  ): SearchPosition | undefined {
    if (value === undefined) return undefined;
    try {
      const encoded = Buffer.from(value, 'base64url');
      if (encoded.length < 29 || encoded.toString('base64url') !== value)
        throw new Error('Invalid cursor');
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.cursorKey,
        encoded.subarray(0, 12),
      );
      decipher.setAAD(Buffer.from(scope));
      decipher.setAuthTag(encoded.subarray(12, 28));
      const [score, id] = JSON.parse(
        Buffer.concat([
          decipher.update(encoded.subarray(28)),
          decipher.final(),
        ]).toString(),
      ) as unknown[];
      if (
        typeof score === 'number' &&
        Number.isFinite(score) &&
        typeof id === 'string' &&
        isUUID(id, '7')
      ) {
        return [score, id];
      }
    } catch {
      // Malformed cursors use the same response as cursors from a different query.
    }
    throw new BadRequestException({ code: 'invalid_cursor' });
  }

  private cursor(scope: string, [score, id]: SearchPosition): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.cursorKey, iv);
    cipher.setAAD(Buffer.from(scope));
    const data = Buffer.concat([
      cipher.update(JSON.stringify([score, id])),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
  }
}

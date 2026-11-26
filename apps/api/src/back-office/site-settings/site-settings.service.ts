import {
  HttpException,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, type ClientSession } from 'mongoose';
import type { SignedInAccount } from '../../auth/strategies/jwt.strategy';
import { PublishingAuditEvent } from '../../publishing/persistence/publishing-event.schema';
import { PublishingService } from '../../publishing/publishing.service';
import { AuditTargetType } from '../audit-event.types';
import {
  SocialPlatform,
  type FeaturedMaterialDto,
  type PublicSiteSettingsDto,
  type SiteLinkDto,
  type SiteSettingsDto,
  type SiteSettingsInputDto,
  type UpdateSiteSettingsDto,
} from './site-settings.dto';
import { SiteSettings } from './site-settings.schema';

const siteId = '019a9451-2b60-7000-8000-000000000901';
const defaults: SiteSettingsInputDto = {
  siteName: 'България, която изгубихме',
  supportContact: null,
  footerLinks: [],
  socialLinks: [],
  banners: [],
  featuredMaterialIds: [],
};

const socialHosts: Record<SocialPlatform, string[]> = {
  YouTube: ['youtube.com', 'www.youtube.com'],
  Facebook: ['facebook.com', 'www.facebook.com'],
  Instagram: ['instagram.com', 'www.instagram.com'],
  TikTok: ['tiktok.com', 'www.tiktok.com'],
};

const defaultOrigin = 'https://archive.invalid';
function validLink(input: string, platform?: SocialPlatform): boolean {
  // Prevent browsers from normalizing backslashes or control characters into a different URL.
  if (/[\s\\\p{Cc}\p{Cf}]/u.test(input)) return false;
  const local = input.startsWith('/') && !input.startsWith('//');
  if (!local && !input.startsWith('https://')) return false;
  try {
    const url = new URL(input, defaultOrigin);
    if (url.username || url.password) return false;
    if (platform) {
      return (
        !local &&
        !url.port &&
        socialHosts[platform].includes(url.hostname) &&
        url.pathname !== '/'
      );
    }
    return !local || url.origin === defaultOrigin;
  } catch {
    return false;
  }
}

function copyLink({ label, url }: SiteLinkDto): SiteLinkDto {
  return { label, url };
}

function configuration(input: SiteSettingsInputDto): SiteSettingsInputDto {
  return {
    siteName: input.siteName,
    supportContact: input.supportContact ?? null,
    footerLinks: input.footerLinks.map(copyLink),
    socialLinks: input.socialLinks.map(({ platform, url }) => ({
      platform,
      url,
    })),
    banners: input.banners.map(({ text, enabled, link }) => ({
      text,
      enabled,
      ...(link ? { link: copyLink(link) } : {}),
    })),
    featuredMaterialIds: [...input.featuredMaterialIds],
  };
}

@Injectable()
export class SiteSettingsService {
  constructor(
    @InjectModel(SiteSettings.name)
    private readonly settings: Model<SiteSettings>,
    @InjectModel(PublishingAuditEvent.name)
    private readonly audit: Model<PublishingAuditEvent>,
    @InjectConnection() private readonly connection: Connection,
    private readonly publishing: PublishingService,
  ) {}

  static etag(version: number): string {
    return '"site-settings-v' + version + '"';
  }

  async get(): Promise<SiteSettingsDto> {
    return this.present(await this.settings.findById(siteId).lean().exec());
  }

  async publicSettings(): Promise<PublicSiteSettingsDto> {
    const { featuredMaterialIds, ...presentation } = configuration(
      (await this.settings.findById(siteId).lean().exec())?.configuration ??
        defaults,
    );
    const featured = await Promise.all(
      featuredMaterialIds.map((id) => this.featured(id)),
    );
    return {
      ...presentation,
      banners: presentation.banners.filter((banner) => banner.enabled),
      featuredMaterials: featured.filter(
        (material): material is FeaturedMaterialDto => material !== null,
      ),
    };
  }

  async replace(
    principal: SignedInAccount,
    correlationId: string,
    ifMatch: string | undefined,
    dto: UpdateSiteSettingsDto,
  ): Promise<SiteSettingsDto> {
    if (!ifMatch)
      throw new HttpException({ code: 'precondition_required' }, 428);
    const next = configuration(dto);
    this.checkLinks(next);
    return this.connection.transaction(async (session) => {
      const record = await this.settings
        .findById(siteId)
        .session(session)
        .lean()
        .exec();
      const current = this.present(record);
      if (ifMatch !== SiteSettingsService.etag(current.version)) {
        throw new PreconditionFailedException({ code: 'version_conflict' });
      }
      const fields = (
        Object.keys(next) as (keyof SiteSettingsInputDto)[]
      ).filter(
        (field) =>
          JSON.stringify(next[field]) !== JSON.stringify(current[field]),
      );
      if (!fields.length) return current;

      if (fields.includes('featuredMaterialIds')) {
        for (const id of next.featuredMaterialIds) {
          if (!(await this.featured(id, session))) {
            throw new UnprocessableEntityException({
              code: 'featured_material_unavailable',
            });
          }
        }
      }

      const occurredAt = new Date();
      const updated = await this.settings
        .findOneAndUpdate(
          { _id: siteId, version: current.version },
          {
            $set: { configuration: next, lastChangedAt: occurredAt },
            $inc: { version: 1 },
          },
          { returnDocument: 'after', session },
        )
        .lean()
        .exec();
      if (!updated)
        throw new PreconditionFailedException({ code: 'version_conflict' });
      await this.audit.create(
        [
          {
            actorId: principal.profile.id,
            actorRole: principal.profile.role,
            targetType: AuditTargetType.SiteSettings,
            targetId: siteId,
            targetVersion: updated.version,
            action: 'SiteSettingsUpdated',
            reason: dto.reason,
            metadata: { fields },
            correlationId,
            occurredAt,
          },
        ],
        { session },
      );
      return this.present(updated);
    });
  }

  private present(record: SiteSettings | null): SiteSettingsDto {
    if (!record)
      throw new ServiceUnavailableException({
        code: 'site_settings_not_initialized',
      });
    return {
      ...configuration(record.configuration ?? defaults),
      version: record.version,
      ...(record.lastChangedAt
        ? { updatedAtUtc: record.lastChangedAt.toISOString() }
        : {}),
    };
  }

  private checkLinks(input: SiteSettingsInputDto): void {
    if (
      input.footerLinks.some(({ url }) => !validLink(url)) ||
      input.banners.some(({ link }) => link && !validLink(link.url))
    ) {
      throw new UnprocessableEntityException({ code: 'site_link_invalid' });
    }
    const platforms = new Set(
      input.socialLinks.map(({ platform }) => platform),
    );
    if (
      platforms.size !== input.socialLinks.length ||
      input.socialLinks.some(({ platform, url }) => !validLink(url, platform))
    ) {
      throw new UnprocessableEntityException({
        code: 'site_social_link_invalid',
      });
    }
  }

  private async featured(
    id: string,
    session?: ClientSession,
  ): Promise<FeaturedMaterialDto | null> {
    try {
      const material = await this.publishing.publicById(id, session);
      return {
        id: material.id,
        title: material.content.title,
        slug: material.slug,
      };
    } catch (error) {
      if (error instanceof NotFoundException) return null;
      throw error;
    }
  }
}

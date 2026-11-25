import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NbAlertModule, NbButtonModule, NbCardModule, NbInputModule } from '@nebular/theme';
import type { SiteBanner } from '../../api/generated/models/site-banner';
import type { SiteLink } from '../../api/generated/models/site-link';
import type { SiteSocialLink } from '../../api/generated/models/site-social-link';
import type { UpdateSiteSettingsRequest } from '../../api/generated/models/update-site-settings-request';
import { PublishingService } from '../../api/generated/services/publishing.service';
import { SiteFooter, SiteNotices } from '../../core/site-presentation/site-presentation';
import { SiteSettingsStore } from './site-settings.store';

type SettingsDraft = Omit<UpdateSiteSettingsRequest, 'reason'>;

const empty: SettingsDraft = {
  siteName: '',
  supportContact: '',
  banners: [],
  footerLinks: [],
  socialLinks: [],
  featuredMaterialIds: [],
};

const emptyLink = { label: '', url: '' };
const uuidV7 = /^[\da-f]{8}-[\da-f]{4}-7[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

@Component({
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    NbAlertModule,
    NbButtonModule,
    NbCardModule,
    NbInputModule,
    SiteFooter,
    SiteNotices,
  ],
  providers: [SiteSettingsStore],
  templateUrl: './site-settings-page.html',
  styleUrls: ['../editorial/editorial.scss', './site-settings-page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteSettingsPage {
  protected readonly store = inject(SiteSettingsStore);
  private readonly publishing = inject(PublishingService);
  protected readonly tab = signal<'general' | 'social' | 'home'>('general');
  protected readonly previewing = signal(false);
  private readonly homeOpened = signal(false);
  protected readonly formError = signal('');
  protected readonly notice = signal('');
  protected readonly reason = signal('');
  protected readonly materialId = signal('');
  protected readonly platforms: SiteSocialLink['platform'][] = [
    'YouTube',
    'Facebook',
    'Instagram',
    'TikTok',
  ];
  protected readonly draft = linkedSignal({
    source: this.store.current,
    computation: (current): SettingsDraft => {
      if (!current) return empty;
      const { siteName, supportContact, banners, footerLinks, socialLinks, featuredMaterialIds } =
        current.document;
      return { siteName, supportContact, banners, footerLinks, socialLinks, featuredMaterialIds };
    },
  });

  protected readonly materials = rxResource({
    params: () => (this.homeOpened() ? true : undefined),
    stream: () => this.publishing.listMaterials({ status: 'Published' }),
  });
  protected readonly materialTitles = computed(() => {
    const materials = this.materials.hasValue() ? (this.materials.value()?.items ?? []) : [];
    return new Map(materials.map(({ id, title }) => [id, title]));
  });

  constructor() {
    void this.store.load();
  }

  protected change<K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]): void {
    this.draft.update((draft) => ({ ...draft, [key]: value }));
    this.formError.set('');
    this.notice.set('');
  }

  protected openHome(): void {
    this.homeOpened.set(true);
    this.tab.set('home');
  }

  protected addFooterLink(): void {
    this.change('footerLinks', [...this.draft().footerLinks, { ...emptyLink }]);
  }

  protected removeFooterLink(index: number): void {
    this.change(
      'footerLinks',
      this.draft().footerLinks.filter((_, position) => position !== index),
    );
  }

  protected addBanner(): void {
    this.change('banners', [...this.draft().banners, { text: '', enabled: true }]);
  }

  protected removeBanner(index: number): void {
    this.change(
      'banners',
      this.draft().banners.filter((_, position) => position !== index),
    );
  }

  protected removeFeatured(index: number): void {
    this.change(
      'featuredMaterialIds',
      this.draft().featuredMaterialIds.filter((_, position) => position !== index),
    );
  }

  protected changeFooterLink(index: number, field: keyof SiteLink, value: string): void {
    this.change(
      'footerLinks',
      this.draft().footerLinks.map((link, position) =>
        position === index ? { ...link, [field]: value } : link,
      ),
    );
  }

  protected changeBanner(index: number, patch: Partial<SiteBanner>): void {
    this.change(
      'banners',
      this.draft().banners.map((banner, position) =>
        position === index ? { ...banner, ...patch } : banner,
      ),
    );
  }

  protected changeBannerLink(index: number, field: keyof SiteLink, value: string): void {
    const link = { ...(this.draft().banners[index].link ?? emptyLink), [field]: value };
    this.changeBanner(index, { link: link.url || link.label ? link : undefined });
  }

  protected setSocial(platform: SiteSocialLink['platform'], url: string): void {
    const updated = this.draft().socialLinks.filter((link) => link.platform !== platform);
    if (url) updated.push({ platform, url });
    this.change(
      'socialLinks',
      this.platforms.flatMap((key) => updated.filter((link) => link.platform === key)),
    );
  }

  protected socialUrl(platform: SiteSocialLink['platform']): string {
    return this.draft().socialLinks.find((link) => link.platform === platform)?.url ?? '';
  }

  protected addFeatured(): void {
    const id = this.materialId().trim().toLowerCase();
    const ids = this.draft().featuredMaterialIds;
    if (!uuidV7.test(id)) {
      this.formError.set('Избери материал или въведи валиден ID.');
      return;
    }
    if (ids.length >= 6 || ids.includes(id)) {
      this.formError.set('Избери до шест различни материала.');
      return;
    }
    this.change('featuredMaterialIds', [...ids, id]);
    this.materialId.set('');
  }

  protected moveFeatured(index: number, direction: -1 | 1): void {
    const ids = [...this.draft().featuredMaterialIds];
    const other = index + direction;
    if (other < 0 || other >= ids.length) return;
    [ids[index], ids[other]] = [ids[other], ids[index]];
    this.change('featuredMaterialIds', ids);
  }

  protected openPreview(): void {
    const draft = this.payload();
    if (
      !draft.siteName ||
      draft.footerLinks.some(({ label, url }) => !label || !url) ||
      draft.banners.some(({ text, link }) => !text || (link && (!link.label || !link.url)))
    ) {
      this.formError.set('Попълни името, текста на лентите и двете полета на всяка връзка.');
      return;
    }
    this.store.clearError();
    this.previewing.set(true);
    this.formError.set('');
  }

  protected async reload(): Promise<void> {
    if (await this.store.load()) {
      this.formError.set('');
      this.previewing.set(false);
      this.reason.set('');
      this.notice.set('Заредих актуалните настройки.');
    }
  }

  protected async save(): Promise<void> {
    const reason = this.reason().trim();
    if (!reason) {
      this.formError.set('Посочи причина за промяната.');
      return;
    }
    this.formError.set('');
    if (await this.store.save({ ...this.payload(), reason })) {
      this.previewing.set(false);
      this.reason.set('');
      this.notice.set('Настройките са записани.');
    }
  }

  private payload(): SettingsDraft {
    const draft = this.draft();
    const cleanLink = ({ label, url }: SiteLink): SiteLink => ({
      label: label.trim(),
      url: url.trim(),
    });
    return {
      ...draft,
      siteName: draft.siteName.trim(),
      supportContact: draft.supportContact?.trim() || null,
      footerLinks: draft.footerLinks.map(cleanLink),
      socialLinks: draft.socialLinks
        .filter(({ url }) => !!url.trim())
        .map(({ platform, url }) => ({ platform, url: url.trim() })),
      banners: draft.banners.map(({ text, enabled, link }) => ({
        text: text.trim(),
        enabled,
        ...(link ? { link: cleanLink(link) } : {}),
      })),
    };
  }
}

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { PublicSiteSettings } from '../../api/generated/models/public-site-settings';
import type { SiteBanner } from '../../api/generated/models/site-banner';

type FooterContent = Pick<PublicSiteSettings, 'footerLinks' | 'socialLinks' | 'supportContact'>;

@Component({
  selector: 'app-site-notices',
  template: `
    @for (banner of visible(); track $index) {
      <aside class="notice" aria-label="Съобщение от архива">
        <span>{{ banner.text }}</span>
        @if (banner.link; as link) {
          @if (preview()) {
            <span>{{ link.label }}</span>
          } @else {
            <a [href]="link.url">{{ link.label }}</a>
          }
        }
      </aside>
    }
  `,
  styles: `
    .notice {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem 1rem;
      align-items: baseline;
      padding: 0.75rem 1rem;
      margin-bottom: 0.75rem;
      border-inline-start: 0.2rem solid var(--color-primary-500);
      background: var(--color-primary-transparent-100);
      overflow-wrap: anywhere;
    }
    .notice a {
      font-weight: 600;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteNotices {
  readonly preview = input(false);
  readonly banners = input.required<SiteBanner[]>();
  protected readonly visible = computed(() => this.banners().filter((banner) => banner.enabled));
}

@Component({
  selector: 'app-site-footer',
  template: `
    @let content = settings();
    @if (content.footerLinks.length || content.socialLinks.length || content.supportContact) {
      <nav class="site-links" aria-label="Връзки на архива">
        @for (link of content.footerLinks; track $index) {
          @if (preview()) {
            <span>{{ link.label }}</span>
          } @else {
            <a [href]="link.url">{{ link.label }}</a>
          }
        }
        @for (link of content.socialLinks; track $index) {
          @if (preview()) {
            <span>{{ link.platform }}</span>
          } @else {
            <a [href]="link.url" rel="me">{{ link.platform }}</a>
          }
        }
        @if (content.supportContact; as email) {
          @if (preview()) {
            <span>{{ email }}</span>
          } @else {
            <a [href]="'mailto:' + email">Контакт</a>
          }
        }
      </nav>
    }
  `,
  styles: `
    .site-links {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 1.25rem;
      align-items: center;
      overflow-wrap: anywhere;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteFooter {
  readonly preview = input(false);
  readonly settings = input.required<FooterContent>();
}

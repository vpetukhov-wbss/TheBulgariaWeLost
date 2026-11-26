import { Injectable, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, startWith, switchMap } from 'rxjs';
import type { PublicSiteSettings } from '../../api/generated/models/public-site-settings';
import { PublicSiteSettingsService } from '../../api/generated/services/public-site-settings.service';

const fallback: PublicSiteSettings = {
  siteName: 'България, която изгубихме',
  banners: [],
  featuredMaterials: [],
  footerLinks: [],
  socialLinks: [],
};

@Injectable({ providedIn: 'root' })
export class SitePresentationResource {
  private readonly api = inject(PublicSiteSettingsService);
  private readonly updates = new Subject<void>();

  readonly settings = toSignal(
    this.updates.pipe(
      startWith(undefined),
      switchMap(() => this.api.getPublicSiteSettings().pipe(catchError(() => EMPTY))),
    ),
    { initialValue: fallback },
  );

  refresh(): void {
    this.updates.next();
  }
}

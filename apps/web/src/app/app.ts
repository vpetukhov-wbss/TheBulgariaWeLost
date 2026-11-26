import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { NbAuthService, NbTokenService } from '@nebular/auth';
import { NbEvaIconsModule } from '@nebular/eva-icons';
import { NbSecurityModule } from '@nebular/security';
import { NbButtonModule, NbIconModule, NbLayoutModule, NbToastrService } from '@nebular/theme';
import { firstValueFrom } from 'rxjs';
import { AUTH_STRATEGY } from './core/auth/auth.config';
import { SiteFooter, SiteNotices } from './core/site-presentation/site-presentation';
import { SitePresentationResource } from './core/site-presentation/site-presentation.resource';

@Component({
  selector: 'app-root',
  imports: [
    RouterLink,
    RouterOutlet,
    NbLayoutModule,
    NbButtonModule,
    NbIconModule,
    NbEvaIconsModule,
    NbSecurityModule,
    SiteFooter,
    SiteNotices,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly auth = inject(NbAuthService);
  private readonly tokens = inject(NbTokenService);
  private readonly router = inject(Router);
  private readonly toastr = inject(NbToastrService);

  protected readonly presentation = inject(SitePresentationResource).settings;
  protected readonly inBackOffice = computed(
    () =>
      this.router.lastSuccessfulNavigation()?.finalUrl?.root.children['primary']?.segments[0]
        ?.path === 'admin',
  );
  protected readonly hasFooter = computed(() => {
    const site = this.presentation();
    return !!(site.footerLinks.length || site.socialLinks.length || site.supportContact);
  });
  protected readonly signingOut = signal(false);

  protected async logout(): Promise<void> {
    if (this.signingOut()) return;
    this.signingOut.set(true);
    try {
      const result = await firstValueFrom(this.auth.logout(AUTH_STRATEGY));
      if (!result.isSuccess()) {
        this.toastr.warning('Локалната сесия е прекратена. Сървърът не потвърди изхода.');
      }
    } finally {
      await firstValueFrom(this.tokens.clear());
      this.signingOut.set(false);
      await this.router.navigate(['/login']);
    }
  }
}

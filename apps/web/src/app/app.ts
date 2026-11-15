import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { NbAuthService, NbTokenService } from '@nebular/auth';
import { NbEvaIconsModule } from '@nebular/eva-icons';
import { NbSecurityModule } from '@nebular/security';
import { NbButtonModule, NbIconModule, NbLayoutModule, NbToastrService } from '@nebular/theme';
import { firstValueFrom } from 'rxjs';
import { AUTH_STRATEGY } from './core/auth/auth.config';

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
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly auth = inject(NbAuthService);
  private readonly tokens = inject(NbTokenService);
  private readonly router = inject(Router);
  private readonly toastr = inject(NbToastrService);

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

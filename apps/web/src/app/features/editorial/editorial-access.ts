import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { NbTokenService } from '@nebular/auth';
import { firstValueFrom } from 'rxjs';
import { problemCode } from '../../core/auth/auth-errors';

@Injectable({ providedIn: 'root' })
export class EditorialAccess {
  private readonly router = inject(Router);
  private readonly tokens = inject(NbTokenService);

  async redirectOnAccessError(error: unknown): Promise<boolean> {
    if (!(error instanceof HttpErrorResponse)) return false;
    const returnTo = this.router.url;
    if (error.status === 401) {
      await firstValueFrom(this.tokens.clear());
      await this.router.navigate(['/login'], { queryParams: { returnTo } });
      return true;
    }
    if (error.status === 403) {
      if (problemCode(error) === 'mfa_required') {
        await this.router.navigate(['/mfa'], { queryParams: { returnTo } });
      } else {
        await this.router.navigate(['/forbidden']);
      }
      return true;
    }
    return false;
  }
}

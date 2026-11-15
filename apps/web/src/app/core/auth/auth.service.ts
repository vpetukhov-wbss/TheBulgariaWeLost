import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { NbAuthResult, NbAuthService, NbTokenService } from '@nebular/auth';
import { finalize, Observable, shareReplay, tap } from 'rxjs';

@Injectable()
export class ArchiveAuthService extends NbAuthService {
  private readonly tokens = inject(NbTokenService);
  private refreshInFlight?: Observable<NbAuthResult>;

  override refreshToken(strategyName: string, data?: unknown): Observable<NbAuthResult> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = super.refreshToken(strategyName, data).pipe(
        tap((result) => {
          const response: unknown = result.getResponse();
          if (response instanceof HttpErrorResponse && [401, 403].includes(response.status)) {
            // Nebular's clear operation updates storage and publishes the change synchronously.
            this.tokens.clear();
          }
        }),
        finalize(() => {
          this.refreshInFlight = undefined;
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.refreshInFlight;
  }
}

import { Injectable, inject } from '@angular/core';
import type { NbAuthToken } from '@nebular/auth';
import { NbAuthTokenParceler, NbTokenStorage } from '@nebular/auth';

/**
 * Keeps the Nebular token pack across a page reload, but removes it when the
 * browser tab is closed. This is enough for direct protected routes without
 * turning a long-lived refresh token into permanent local storage.
 */
@Injectable()
export class SessionTokenStorage extends NbTokenStorage {
  private readonly key = 'the_bulgaria_we_lost_auth';
  private readonly parceler = inject(NbAuthTokenParceler);

  constructor() {
    super();
  }

  override get(): NbAuthToken {
    return this.parceler.unwrap(sessionStorage.getItem(this.key) ?? '');
  }

  override set(token: NbAuthToken): void {
    if (!token.getValue()) {
      this.clear();
      return;
    }
    sessionStorage.setItem(this.key, this.parceler.wrap(token));
  }

  override clear(): void {
    sessionStorage.removeItem(this.key);
  }
}

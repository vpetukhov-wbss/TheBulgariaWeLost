import { Injectable } from '@angular/core';
import type { NbAuthToken } from '@nebular/auth';
import { NbAuthSimpleToken, NbTokenStorage } from '@nebular/auth';

@Injectable()
export class MemoryTokenStorage extends NbTokenStorage {
  private readonly empty = new NbAuthSimpleToken('', '');
  private token: NbAuthToken = this.empty;

  override get(): NbAuthToken {
    return this.token;
  }

  override set(token: NbAuthToken): void {
    // A successful registration may return 204 without issuing a session.
    if (token.getValue()) this.token = token;
  }

  override clear(): void {
    this.token = this.empty;
  }
}

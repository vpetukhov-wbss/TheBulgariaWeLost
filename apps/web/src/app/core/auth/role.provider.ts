import { Injectable, inject } from '@angular/core';
import { NbAuthOAuth2JWTToken, NbAuthService } from '@nebular/auth';
import { NbRoleProvider } from '@nebular/security';
import { map } from 'rxjs';

export type ArchiveRole = 'User' | 'Editor' | 'Administrator';

@Injectable()
export class ArchiveRoleProvider extends NbRoleProvider {
  private readonly auth = inject(NbAuthService);

  override getRole() {
    return this.auth.onTokenChange().pipe(
      map((token) => {
        if (!(token instanceof NbAuthOAuth2JWTToken)) return 'Guest';
        const claims: unknown = token.getAccessTokenPayload();
        if (!claims || typeof claims !== 'object' || !('role' in claims)) return 'User';

        const claim = claims.role;
        const role = claim && typeof claim === 'object' && 'name' in claim ? claim.name : claim;
        // Claims drive navigation only. The API supplies current back-office permissions.
        if (role === 'Administrator' || role === 'Editor') return role;
        return 'User';
      }),
    );
  }
}

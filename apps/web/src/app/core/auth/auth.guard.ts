import { HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import type { CanActivateFn, UrlTree } from '@angular/router';
import { Router } from '@angular/router';
import { NbAuthService, NbTokenService } from '@nebular/auth';
import { catchError, map, of, switchMap } from 'rxjs';
import { BackOfficeService } from '../../api/generated/services/back-office.service';
import { problemCode } from './auth-errors';

function loginRoute(router: Router, returnTo: string): UrlTree {
  return router.createUrlTree(['/login'], { queryParams: { returnTo } });
}

export const signedInGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  return inject(NbAuthService)
    .isAuthenticatedOrRefresh()
    .pipe(map((authenticated) => authenticated || loginRoute(router, state.url)));
};

/**
 * The API is authoritative here. JWT roles only control navigation hints and
 * are never enough to enter the editor or administrator area.
 */
export const backOfficeGuard: CanActivateFn = (route, state) => {
  const requiredPermission: unknown = route.data['requiredPermission'];
  const router = inject(Router);
  const auth = inject(NbAuthService);
  const tokens = inject(NbTokenService);
  const backOffice = inject(BackOfficeService);

  return auth.isAuthenticatedOrRefresh().pipe(
    switchMap((authenticated) => {
      if (!authenticated) return of(loginRoute(router, state.url));

      return backOffice.getBackOfficePrincipal().pipe(
        map((principal) => {
          if (typeof requiredPermission !== 'string') return true;
          if (principal.permissions.includes(requiredPermission)) return true;
          return router.createUrlTree(['/forbidden']);
        }),
        catchError((error: unknown) => {
          if (error instanceof HttpErrorResponse && error.status === 401) {
            return tokens.clear().pipe(map(() => loginRoute(router, state.url)));
          }
          if (error instanceof HttpErrorResponse && error.status === 403) {
            return of(
              problemCode(error) === 'mfa_required'
                ? router.createUrlTree(['/mfa'], { queryParams: { returnTo: state.url } })
                : router.createUrlTree(['/forbidden']),
            );
          }

          // Let the protected screen render its explicit unavailable state.
          return of(true);
        }),
      );
    }),
  );
};

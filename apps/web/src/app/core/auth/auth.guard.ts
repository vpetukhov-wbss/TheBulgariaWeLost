import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { NbAuthService } from '@nebular/auth';
import { map } from 'rxjs';

export const signedInGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  return inject(NbAuthService)
    .isAuthenticatedOrRefresh()
    .pipe(
      map(
        (authenticated) =>
          authenticated ||
          router.createUrlTree(['/login'], { queryParams: { returnTo: state.url } }),
      ),
    );
};

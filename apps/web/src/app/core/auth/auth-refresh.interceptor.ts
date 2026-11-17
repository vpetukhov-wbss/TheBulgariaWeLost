import type { HttpInterceptorFn } from '@angular/common/http';
import { NbAuthOAuth2JWTToken } from '@nebular/auth';
import { REFRESH_URL } from './auth.config';

export const brocodersRefreshInterceptor: HttpInterceptorFn = (request, next) => {
  if (request.method !== 'POST' || request.url !== REFRESH_URL) return next(request);

  // Nebular passes its token object to the password strategy. Nest expects only the refresh bearer.
  const token: unknown = request.body;
  const refreshToken = token instanceof NbAuthOAuth2JWTToken ? token.getRefreshToken() : undefined;
  return next(
    request.clone({
      body: null,
      setHeaders: refreshToken ? { Authorization: `Bearer ${refreshToken}` } : {},
    }),
  );
};

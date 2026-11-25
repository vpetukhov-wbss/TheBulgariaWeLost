import type { HttpRequest, HttpResponse } from '@angular/common/http';
import type { NbPasswordAuthStrategyOptions } from '@nebular/auth';
import {
  NbAuthIllegalTokenError,
  NbAuthOAuth2JWTToken,
  NbPasswordAuthStrategy,
} from '@nebular/auth';

export const AUTH_STRATEGY = 'email';
export const AUTH_API = '/api/v1/auth/';
export const BACK_OFFICE_SESSION_URL = '/api/admin/v1/me';
export const REFRESH_URL = AUTH_API + 'refresh';

const anonymousAuthPaths = new Set(
  [
    'email/login',
    'email/register',
    'email/confirm',
    'email/confirm/new',
    'forgot/password',
    'reset/password',
    'refresh',
  ].map((endpoint) => AUTH_API + endpoint),
);

export function skipBearer(request: HttpRequest<unknown>): boolean {
  if (
    !request.url.startsWith('/api/') ||
    request.url.includes('\\') ||
    request.headers.has('Authorization')
  )
    return true;

  const { pathname } = new URL(request.url, 'https://archive.invalid');
  return (
    !/^\/api\/(?:v1|admin\/v1)\//.test(pathname) ||
    anonymousAuthPaths.has(pathname) ||
    pathname === '/api/v1/site-settings' ||
    /^\/api\/v1\/materials\/[^/]+\/reports$/.test(pathname)
  );
}

function readTokens(_action: string, response: HttpResponse<unknown>) {
  // Registration returns 204. Nebular still calls the login token getter.
  if (response.status === 204) return { access_token: '' };

  const body = response.body;
  if (
    !body ||
    typeof body !== 'object' ||
    !('token' in body) ||
    typeof body.token !== 'string' ||
    !('refreshToken' in body) ||
    typeof body.refreshToken !== 'string' ||
    !body.refreshToken
  ) {
    throw new NbAuthIllegalTokenError('Сървърът върна невалидна сесия.');
  }
  return { access_token: body.token, refresh_token: body.refreshToken };
}

const options: NbPasswordAuthStrategyOptions = {
  name: AUTH_STRATEGY,
  baseEndpoint: AUTH_API,
  token: { class: NbAuthOAuth2JWTToken, getter: readTokens },
  login: {
    endpoint: 'email/login',
    defaultErrors: ['Входът е неуспешен. Провери данните си и опитай отново.'],
  },
  register: {
    endpoint: 'email/register',
    requireValidToken: false,
    defaultErrors: ['Регистрацията е неуспешна. Провери данните си и опитай отново.'],
  },
  requestPass: {
    endpoint: 'forgot/password',
    defaultErrors: ['Заявката не успя. Опитай отново.'],
  },
  resetPass: {
    endpoint: 'reset/password',
    method: 'post',
    resetPasswordTokenKey: 'hash',
    defaultErrors: ['Паролата не беше сменена. Поискай нов линк и опитай отново.'],
  },
  logout: { endpoint: 'logout', method: 'post' },
  refreshToken: { endpoint: 'refresh' },
};

export const emailStrategy = NbPasswordAuthStrategy.setup(options);

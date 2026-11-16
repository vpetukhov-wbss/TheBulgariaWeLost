import { HttpInterceptorFn } from '@angular/common/http';

const correlationHeader = 'X-Correlation-ID';

export const correlationIdInterceptor: HttpInterceptorFn = (request, next) => {
  if (request.headers.has(correlationHeader)) return next(request);

  return next(
    request.clone({
      setHeaders: { [correlationHeader]: crypto.randomUUID() },
    }),
  );
};

import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { SessionService } from './session.service';

/** Toute réponse 401 sur une route de données ramène à l'écran de connexion. */
export const sessionInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(SessionService);
  return next(req).pipe(
    tap({
      error: (err) => {
        if (err?.status === 401 && !req.url.startsWith('/bff/session/')) {
          session.expire();
        }
      },
    }),
  );
};

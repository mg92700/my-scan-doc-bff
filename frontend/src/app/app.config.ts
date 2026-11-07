import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { sessionInterceptor } from './core/session/session.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Le jeton CSRF (cookie XSRF-TOKEN -> en-tête X-XSRF-TOKEN) est géré automatiquement par HttpClient.
    provideHttpClient(withInterceptors([sessionInterceptor])),
  ],
};

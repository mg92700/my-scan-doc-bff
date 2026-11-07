import { Component, inject } from '@angular/core';
import { ApiStatus } from './core/api-status/api-status';
import { Documents } from './features/documents/documents';
import { Login } from './features/auth/login/login';
import { SessionService } from './core/session/session.service';

@Component({
  selector: 'app-root',
  imports: [Login, Documents, ApiStatus],
  template: `
    @if (session.ready()) {
      @if (session.user()) {
        <app-documents />
      } @else {
        <app-login />
      }
    }
    <app-api-status />
  `,
})
export class App {
  protected readonly session = inject(SessionService);

  constructor() {
    void this.session.restore();
  }
}

import { Component, inject } from '@angular/core';
import { ApiStatus } from './api-status';
import { Documents } from './documents';
import { Login } from './login';
import { SessionService } from './session.service';

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

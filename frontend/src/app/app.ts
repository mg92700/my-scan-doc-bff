import { Component, inject } from '@angular/core';
import { Documents } from './documents';
import { Login } from './login';
import { SessionService } from './session.service';

@Component({
  selector: 'app-root',
  imports: [Login, Documents],
  template: `
    @if (session.ready()) {
      @if (session.user()) {
        <app-documents />
      } @else {
        <app-login />
      }
    }
  `,
})
export class App {
  protected readonly session = inject(SessionService);

  constructor() {
    void this.session.restore();
  }
}

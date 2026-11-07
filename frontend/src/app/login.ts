import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SessionService } from './session.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  template: `
    <main class="login">
      <form class="card" (ngSubmit)="submit()" autocomplete="on">
        <h1>My Scan Doc</h1>
        <p class="muted">Connectez-vous pour consulter vos documents.</p>
        <label>Identifiant
          <input name="username" [(ngModel)]="username" autocomplete="username" required autofocus />
        </label>
        <label>Mot de passe
          <input name="password" type="password" [(ngModel)]="password" autocomplete="current-password" required />
        </label>
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        <button class="primary" type="submit" [disabled]="busy() || !username || !password">
          {{ busy() ? 'Connexion…' : 'Se connecter' }}
        </button>
      </form>
    </main>
  `,
})
export class Login {
  private readonly session = inject(SessionService);
  protected username = '';
  protected password = '';
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.error.set(await this.session.login(this.username, this.password));
    this.password = '';
    this.busy.set(false);
  }
}

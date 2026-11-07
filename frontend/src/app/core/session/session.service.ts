import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly http = inject(HttpClient);

  /** Nom de l'utilisateur connecté, ou null. */
  readonly user = signal<string | null>(null);
  /** Faux tant que l'on ne sait pas si une session existe déjà (évite de montrer le login pour rien). */
  readonly ready = signal(false);

  /** Au chargement : une session valide existe-t-elle encore ? (pose aussi le cookie CSRF) */
  async restore(): Promise<void> {
    try {
      const me = await firstValueFrom(this.http.get<{ username: string }>('/bff/session/me'));
      this.user.set(me.username);
    } catch {
      this.user.set(null);
    } finally {
      this.ready.set(true);
    }
  }

  /** @returns un message d'erreur à afficher, ou null si la connexion a réussi. */
  async login(username: string, password: string): Promise<string | null> {
    try {
      const res = await firstValueFrom(
        this.http.post<{ username: string }>('/bff/session/login', { username, password }),
      );
      this.user.set(res.username);
      return null;
    } catch (e) {
      const err = e as HttpErrorResponse;
      if (err.status === 401 || err.status === 429) {
        return err.error?.message ?? 'Connexion refusée.';
      }
      return 'Serveur injoignable, réessayez dans un instant.';
    }
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/bff/session/logout', {}));
    } finally {
      this.user.set(null);
      await this.restore(); // le cookie CSRF est renouvelé après la déconnexion
    }
  }

  /** Appelé par l'intercepteur quand le serveur répond 401 : la session a expiré. */
  expire(): void {
    this.user.set(null);
  }
}

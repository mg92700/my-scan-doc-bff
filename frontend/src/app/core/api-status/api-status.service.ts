import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type ApiState = 'checking' | 'up' | 'down';

/**
 * Surveille my-scan-doc-api via le BFF. Interroger l'API la réveille aussi (offre gratuite :
 * elle dort après 15 min et met ~2 min à redémarrer).
 */
@Injectable({ providedIn: 'root' })
export class ApiStatusService {
  private readonly http = inject(HttpClient);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;

  readonly state = signal<ApiState>('checking');
  /** Nombre de fois où l'API est revenue après une indisponibilité : les écrans s'en servent pour se recharger. */
  readonly recovered = signal(0);
  readonly label = computed(() => {
    switch (this.state()) {
      case 'up':
        return 'API disponible';
      case 'down':
        return 'API en veille ou indisponible — réveil en cours…';
      default:
        return "Vérification de l'API…";
    }
  });

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.check();
  }

  stop(): void {
    this.running = false;
    clearTimeout(this.timer);
  }

  private async check(): Promise<void> {
    const before = this.state();
    try {
      const res = await firstValueFrom(this.http.get<{ status: string }>('/bff/api-status'));
      this.state.set(res.status === 'UP' ? 'up' : 'down');
    } catch {
      this.state.set('down');
    }
    if (before === 'down' && this.state() === 'up') {
      this.recovered.update((n) => n + 1);
    }
    if (this.running) {
      // Vérifie vite tant que l'API dort, doucement quand tout va bien
      this.timer = setTimeout(() => void this.check(), this.state() === 'up' ? 60_000 : 10_000);
    }
  }
}

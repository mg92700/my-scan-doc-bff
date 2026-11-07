import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

type State = 'checking' | 'up' | 'down';

/** Pastille fixe en bas à droite : l'API des documents répond-elle ? (interroger l'API la réveille aussi) */
@Component({
  selector: 'app-api-status',
  templateUrl: './api-status.html',
  styleUrl: './api-status.css',
})
export class ApiStatus implements OnDestroy {
  private readonly http = inject(HttpClient);
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;

  protected readonly state = signal<State>('checking');
  protected readonly label = computed(() => {
    switch (this.state()) {
      case 'up':
        return 'API disponible';
      case 'down':
        return 'API en veille ou indisponible — réveil en cours…';
      default:
        return "Vérification de l'API…";
    }
  });

  constructor() {
    void this.check();
  }

  private async check(): Promise<void> {
    try {
      const res = await firstValueFrom(this.http.get<{ status: string }>('/bff/api-status'));
      this.state.set(res.status === 'UP' ? 'up' : 'down');
    } catch {
      this.state.set('down');
    }
    if (!this.stopped) {
      // Vérifie vite tant que l'API dort, doucement quand tout va bien
      this.timer = setTimeout(() => void this.check(), this.state() === 'up' ? 60_000 : 10_000);
    }
  }

  ngOnDestroy(): void {
    this.stopped = true;
    clearTimeout(this.timer);
  }
}

import { Component, OnDestroy, inject } from '@angular/core';
import { ApiStatusService } from './api-status.service';

/** Pastille fixe en bas à droite : l'API des documents répond-elle ? */
@Component({
  selector: 'app-api-status',
  templateUrl: './api-status.html',
  styleUrl: './api-status.css',
})
export class ApiStatus implements OnDestroy {
  private readonly api = inject(ApiStatusService);
  protected readonly state = this.api.state;
  protected readonly label = this.api.label;

  constructor() {
    this.api.start();
  }

  ngOnDestroy(): void {
    this.api.stop();
  }
}

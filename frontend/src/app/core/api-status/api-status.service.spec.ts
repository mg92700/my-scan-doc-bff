import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiStatusService } from './api-status.service';

describe('ApiStatusService', () => {
  let service: ApiStatusService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ApiStatusService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => service.stop());

  const tick = () => new Promise((r) => setTimeout(r));

  it('signale le retour de l’API après une indisponibilité', async () => {
    vi.useFakeTimers();
    service.start();
    http.expectOne('/bff/api-status').flush({ status: 'DOWN' });
    await vi.advanceTimersByTimeAsync(0);
    expect(service.state()).toBe('down');
    expect(service.recovered()).toBe(0);

    await vi.advanceTimersByTimeAsync(10_000);
    http.expectOne('/bff/api-status').flush({ status: 'UP' });
    await vi.advanceTimersByTimeAsync(0);

    expect(service.state()).toBe('up');
    expect(service.recovered()).toBe(1);
    vi.useRealTimers();
  });

  it('ne signale rien si l’API était déjà disponible au départ', async () => {
    service.start();
    http.expectOne('/bff/api-status').flush({ status: 'UP' });
    await tick();
    expect(service.recovered()).toBe(0);
  });

  it('start est idempotent', () => {
    service.start();
    service.start();
    http.expectOne('/bff/api-status').flush({ status: 'UP' });
  });
});

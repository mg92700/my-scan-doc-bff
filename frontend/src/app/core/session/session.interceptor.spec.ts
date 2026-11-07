import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { sessionInterceptor } from './session.interceptor';
import { SessionService } from './session.service';

describe('sessionInterceptor', () => {
  let session: { expire: ReturnType<typeof vi.fn> };
  let client: HttpClient;
  let http: HttpTestingController;

  beforeEach(() => {
    session = { expire: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([sessionInterceptor])),
        provideHttpClientTesting(),
        { provide: SessionService, useValue: session },
      ],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function respond(url: string, status: number): Promise<void> {
    const pending = firstValueFrom(client.get(url)).catch(() => undefined);
    http.expectOne(url).flush(null, { status, statusText: 'x' });
    await pending;
  }

  it('fait expirer la session sur un 401 d’une route de données', async () => {
    await respond('/bff/documents', 401);
    expect(session.expire).toHaveBeenCalledOnce();
  });

  it('ignore les 401 des routes de session', async () => {
    await respond('/bff/session/me', 401);
    expect(session.expire).not.toHaveBeenCalled();
  });

  it('ignore les autres erreurs et les succès', async () => {
    await respond('/bff/documents', 500);
    const ok = firstValueFrom(client.get('/bff/documents'));
    http.expectOne('/bff/documents').flush([]);
    await ok;
    expect(session.expire).not.toHaveBeenCalled();
  });
});

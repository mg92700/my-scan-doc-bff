import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SessionService } from './session.service';

describe('SessionService', () => {
  let service: SessionService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(SessionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('restore : session valide', async () => {
    const p = service.restore();
    http.expectOne('/bff/session/me').flush({ username: 'owner' });
    await p;
    expect(service.user()).toBe('owner');
    expect(service.ready()).toBe(true);
  });

  it('restore : pas de session', async () => {
    const p = service.restore();
    http.expectOne('/bff/session/me').flush(null, { status: 401, statusText: 'Unauthorized' });
    await p;
    expect(service.user()).toBeNull();
    expect(service.ready()).toBe(true);
  });

  it('login réussi', async () => {
    const p = service.login('owner', 'pw');
    const req = http.expectOne('/bff/session/login');
    expect(req.request.body).toEqual({ username: 'owner', password: 'pw' });
    req.flush({ username: 'owner' });
    expect(await p).toBeNull();
    expect(service.user()).toBe('owner');
  });

  it('login refusé affiche le message du serveur', async () => {
    const p = service.login('owner', 'x');
    http.expectOne('/bff/session/login').flush({ message: 'Identifiants invalides.' }, { status: 401, statusText: 'Unauthorized' });
    expect(await p).toBe('Identifiants invalides.');
    expect(service.user()).toBeNull();
  });

  it('login : serveur en panne', async () => {
    const p = service.login('owner', 'x');
    http.expectOne('/bff/session/login').flush(null, { status: 502, statusText: 'Bad Gateway' });
    expect(await p).toContain('injoignable');
  });

  it('logout vide l’utilisateur et renouvelle le cookie CSRF', async () => {
    service.user.set('owner');
    const p = service.logout();
    http.expectOne('/bff/session/logout').flush(null, { status: 204, statusText: 'No Content' });
    await new Promise((r) => setTimeout(r));
    http.expectOne('/bff/session/me').flush(null, { status: 401, statusText: 'Unauthorized' });
    await p;
    expect(service.user()).toBeNull();
  });

  it('expire', () => {
    service.user.set('owner');
    service.expire();
    expect(service.user()).toBeNull();
  });
});

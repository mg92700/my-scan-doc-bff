import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [App], providers: [provideHttpClient(), provideHttpClientTesting()] });
  });

  it('affiche la connexion quand il n’y a pas de session', async () => {
    const fixture = TestBed.createComponent(App);
    TestBed.inject(HttpTestingController)
      .expectOne('/bff/session/me')
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('app-login')).toBeTruthy();
  });

  it('affiche les documents quand la session est valide', async () => {
    const fixture = TestBed.createComponent(App);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/bff/session/me').flush({ username: 'owner' });
    await fixture.whenStable();
    http.expectOne((r) => r.url === '/bff/documents').flush([
      { id: '1', name: 'facture.pdf', size: 2048, contentType: 'application/pdf', createdAt: '2026-01-01T10:00:00Z', archivedAt: null },
    ]);
    await new Promise((r) => setTimeout(r)); // laisse la promesse de liste se résoudre
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-documents')).toBeTruthy();
    expect(el.textContent).toContain('facture.pdf');
  });
});

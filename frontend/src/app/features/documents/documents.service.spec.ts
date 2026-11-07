import { HttpErrorResponse, HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DocumentView } from './document.model';
import { DocumentsService, errorMessage, filenameFrom } from './documents.service';

const doc: DocumentView = {
  id: '42',
  name: 'facture.pdf',
  size: 2048,
  contentType: 'application/pdf',
  createdAt: '2026-01-01T10:00:00Z',
  archivedAt: null,
};

describe('DocumentsService', () => {
  let service: DocumentsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DocumentsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('liste une page avec recherche, décalage et taille', async () => {
    const pending = service.list(true, 'fact', 20, 10);
    const req = http.expectOne((r) => r.url === '/bff/documents');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('archived')).toBe('true');
    expect(req.request.params.get('q')).toBe('fact');
    expect(req.request.params.get('offset')).toBe('20');
    expect(req.request.params.get('limit')).toBe('10');
    const page = { items: [doc], total: 21, offset: 20, limit: 10 };
    req.flush(page);
    expect(await pending).toEqual(page);
  });

  it('liste par défaut : sans recherche, première page de 10', async () => {
    const pending = service.list(false);
    const req = http.expectOne((r) => r.url === '/bff/documents');
    expect(req.request.params.get('q')).toBe('');
    expect(req.request.params.get('offset')).toBe('0');
    expect(req.request.params.get('limit')).toBe('10');
    req.flush({ items: [], total: 0, offset: 0, limit: 10 });
    await pending;
  });

  it('suggestions : noms distincts, limités à 6', async () => {
    let names: string[] = [];
    service.suggestions('fa', false).subscribe((n) => (names = n));
    const req = http.expectOne((r) => r.url === '/bff/documents');
    expect(req.request.params.get('q')).toBe('fa');
    expect(req.request.params.get('limit')).toBe('6');
    req.flush({
      items: [
        { ...doc, name: 'facture.pdf' },
        { ...doc, id: '2', name: 'facture.pdf' },
        { ...doc, id: '3', name: 'fax.pdf' },
      ],
      total: 3,
      offset: 0,
      limit: 6,
    });
    expect(names).toEqual(['facture.pdf', 'fax.pdf']);
  });

  it('suggestions : une erreur donne une liste vide', () => {
    let names: string[] | undefined;
    service.suggestions('fa', false).subscribe((n) => (names = n));
    http
      .expectOne((r) => r.url === '/bff/documents')
      .flush(null, { status: 502, statusText: 'Bad Gateway' });
    expect(names).toEqual([]);
  });

  it('archive et restaure', async () => {
    const archived = service.archive('42');
    const a = http.expectOne('/bff/documents/42/archive');
    expect(a.request.method).toBe('POST');
    a.flush(doc);
    await archived;

    const restored = service.unarchive('42');
    const u = http.expectOne('/bff/documents/42/unarchive');
    expect(u.request.method).toBe('POST');
    u.flush(doc);
    expect(await restored).toEqual(doc);
  });

  it('supprime', async () => {
    const removed = service.remove('42');
    const req = http.expectOne('/bff/documents/42');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    await removed;
  });

  it('envoie le fichier en multipart', async () => {
    const file = new File(['%PDF'], 'scan.pdf', { type: 'application/pdf' });
    const uploaded = service.upload(file);
    const req = http.expectOne('/bff/documents');
    expect(req.request.method).toBe('POST');
    const body = req.request.body as FormData;
    expect((body.get('file') as File).name).toBe('scan.pdf');
    req.flush(doc);
    expect(await uploaded).toEqual(doc);
  });

  describe('download', () => {
    let click: ReturnType<typeof vi.fn<(this: HTMLAnchorElement) => void>>;
    let downloadedAs: string | undefined;

    beforeEach(() => {
      // jsdom n'implémente ni les object URLs ni la navigation sur clic de lien
      URL.createObjectURL = vi.fn(() => 'blob:fake');
      URL.revokeObjectURL = vi.fn();
      click = vi.fn<(this: HTMLAnchorElement) => void>(function (this: HTMLAnchorElement) {
        downloadedAs = this.download;
      });
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(click);
    });

    afterEach(() => vi.restoreAllMocks());

    it('utilise le nom fourni par le serveur', async () => {
      const done = service.download(doc);
      http.expectOne('/bff/documents/42/download').flush(new Blob(['x']), {
        headers: new HttpHeaders({ 'Content-Disposition': 'attachment; filename="serveur.pdf"' }),
      });
      await done;
      expect(click).toHaveBeenCalledOnce();
      expect(downloadedAs).toBe('serveur.pdf');
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    });

    it('retombe sur le nom du document sans en-tête', async () => {
      const done = service.download(doc);
      http.expectOne('/bff/documents/42/download').flush(new Blob(['x']));
      await done;
      expect(downloadedAs).toBe('facture.pdf');
    });
  });
});

describe('filenameFrom', () => {
  it('extrait le nom RFC 5987', () => {
    expect(filenameFrom("attachment; filename*=UTF-8''Facture%20%C3%A9t%C3%A9.pdf")).toBe(
      'Facture été.pdf',
    );
  });

  it('rejette un encodage RFC 5987 invalide', () => {
    expect(filenameFrom("attachment; filename*=UTF-8''%E0%A4%A")).toBeNull();
  });

  it('extrait le nom simple et gère l’absence', () => {
    expect(filenameFrom('attachment; filename="a.pdf"')).toBe('a.pdf');
    expect(filenameFrom('attachment; filename=b.pdf')).toBe('b.pdf');
    expect(filenameFrom(null)).toBeNull();
    expect(filenameFrom('inline')).toBeNull();
  });
});

describe('errorMessage', () => {
  const e = (status: number, error?: unknown) => new HttpErrorResponse({ status, error });

  it('reprend le message du serveur quand il existe', () => {
    expect(errorMessage(e(400, { message: 'Format non supporté' }))).toBe('Format non supporté');
    expect(errorMessage(e(504, { message: 'Ne répond pas' }))).toBe('Ne répond pas');
  });

  it('a un message par défaut pour chaque famille d’erreur', () => {
    expect(errorMessage(e(502))).toBe(
      'Le service documents est indisponible, réessayez dans un instant.',
    );
    for (const status of [400, 404, 413, 415]) {
      expect(errorMessage(e(status))).toBe('Requête refusée.');
    }
    expect(errorMessage(e(0))).toBe('Serveur injoignable.');
    expect(errorMessage(e(500))).toBe('Une erreur est survenue.');
    expect(errorMessage(new Error('boom'))).toBe('Une erreur est survenue.');
    expect(errorMessage(null)).toBe('Une erreur est survenue.');
  });
});

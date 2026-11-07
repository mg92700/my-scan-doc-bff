import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SessionService } from '../../core/session/session.service';
import { DocumentView } from './document.model';
import { Documents } from './documents';
import { DocumentsService } from './documents.service';

function makeDoc(id: string, name: string, contentType = 'application/pdf'): DocumentView {
  return { id, name, size: 2048, contentType, createdAt: '2026-01-01T10:00:00Z', archivedAt: null };
}

type ApiMock = { [K in keyof DocumentsService]: ReturnType<typeof vi.fn> };

describe('Documents', () => {
  let api: ApiMock;
  let session: { user: ReturnType<typeof signal<string | null>>; logout: ReturnType<typeof vi.fn> };
  let fixture: ComponentFixture<Documents>;
  let el: HTMLElement;

  beforeEach(() => {
    api = {
      list: vi
        .fn()
        .mockResolvedValue([
          makeDoc('1', 'facture.pdf'),
          makeDoc('2', 'photos.zip', 'application/zip'),
        ]),
      archive: vi.fn().mockResolvedValue(undefined),
      unarchive: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      upload: vi.fn().mockResolvedValue(undefined),
      download: vi.fn().mockResolvedValue(undefined),
    };
    session = {
      user: signal<string | null>('owner'),
      logout: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      imports: [Documents],
      providers: [
        { provide: DocumentsService, useValue: api },
        { provide: SessionService, useValue: session },
      ],
    });
  });

  /** Laisse les promesses simulées se résoudre puis rafraîchit la vue. */
  async function settle(): Promise<void> {
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
  }

  async function render(): Promise<void> {
    fixture = TestBed.createComponent(Documents);
    el = fixture.nativeElement as HTMLElement;
    await settle();
  }

  const rows = () => Array.from(el.querySelectorAll('tbody tr'));
  const status = () => el.querySelector('[role="status"]')?.textContent?.trim();
  function button(label: string, scope: ParentNode = el): HTMLButtonElement {
    const found = Array.from(scope.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === label,
    );
    if (!found) throw new Error(`Bouton « ${label} » introuvable`);
    return found;
  }

  it('affiche l’utilisateur et la liste des documents', async () => {
    await render();
    expect(api.list).toHaveBeenCalledWith(false);
    expect(el.querySelector('.username')?.textContent).toBe('owner');
    expect(el.querySelector('.avatar')?.textContent).toBe('o');
    expect(rows()).toHaveLength(2);
    expect(rows()[0].textContent).toContain('facture.pdf');
    expect(rows()[0].textContent).toContain('2,0 Ko');
    const badges = Array.from(el.querySelectorAll('.badge')).map((b) =>
      b.getAttribute('data-kind'),
    );
    expect(badges).toEqual(['PDF', 'ZIP']);
  });

  it('affiche « ? » comme initiale sans utilisateur', async () => {
    session.user.set(null);
    await render();
    expect(el.querySelector('.avatar')?.textContent).toBe('?');
  });

  it('filtre par nom sans tenir compte de la casse', async () => {
    await render();
    const search = el.querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = '  FACT ';
    search.dispatchEvent(new Event('input'));
    await settle();
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain('facture.pdf');
  });

  it('affiche un message quand la liste est vide', async () => {
    api.list.mockResolvedValue([]);
    await render();
    expect(el.querySelector('.empty')?.textContent).toContain('Aucun document.');
  });

  it('bascule sur les archives et peut restaurer', async () => {
    await render();
    api.list.mockResolvedValue([makeDoc('3', 'vieux.pdf')]);
    button('Archives').click();
    await settle();
    expect(api.list).toHaveBeenLastCalledWith(true);
    expect(el.querySelector('.drop')).toBeNull();

    button('Restaurer').click();
    await settle();
    expect(api.unarchive).toHaveBeenCalledWith('3');
    expect(status()).toBe('Document restauré.');
    expect(el.querySelector('.empty')?.textContent).toContain('Aucun document archivé.');
  });

  it('archive un document', async () => {
    await render();
    button('Archiver', rows()[0]).click();
    await settle();
    expect(api.archive).toHaveBeenCalledWith('1');
    expect(rows()).toHaveLength(1);
    expect(status()).toBe('Document archivé.');
  });

  it('télécharge un document', async () => {
    await render();
    button('Télécharger', rows()[1]).click();
    await settle();
    expect(api.download).toHaveBeenCalledWith(expect.objectContaining({ id: '2' }));
  });

  it('demande confirmation avant de supprimer, et peut annuler', async () => {
    await render();
    button('Supprimer', rows()[0]).click();
    await settle();
    expect(rows()[0].textContent).toContain('Supprimer définitivement ?');

    button('Annuler', rows()[0]).click();
    await settle();
    expect(rows()[0].textContent).not.toContain('Supprimer définitivement ?');
    expect(api.remove).not.toHaveBeenCalled();
  });

  it('supprime après confirmation', async () => {
    await render();
    button('Supprimer', rows()[0]).click();
    await settle();
    button('Oui, supprimer', rows()[0]).click();
    await settle();
    expect(api.remove).toHaveBeenCalledWith('1');
    expect(rows()).toHaveLength(1);
    expect(status()).toBe('Document supprimé.');
  });

  it('affiche l’erreur d’une action qui échoue', async () => {
    await render();
    api.archive.mockRejectedValue(new HttpErrorResponse({ status: 0 }));
    button('Archiver', rows()[0]).click();
    await settle();
    expect(el.querySelector('.error')?.textContent).toContain('Serveur injoignable.');
    expect(rows()).toHaveLength(2);
  });

  it('affiche l’erreur quand la liste ne se charge pas', async () => {
    api.list.mockRejectedValue(new HttpErrorResponse({ status: 502 }));
    await render();
    expect(el.querySelector('.error')?.textContent).toContain('indisponible');
  });

  it('prévient quand le service met du temps à répondre', async () => {
    vi.useFakeTimers();
    try {
      api.list.mockReturnValue(new Promise(() => {}));
      fixture = TestBed.createComponent(Documents);
      el = fixture.nativeElement as HTMLElement;
      fixture.detectChanges();
      expect(el.textContent).toContain('Chargement…');
      expect(el.querySelector('.info')).toBeNull();

      vi.advanceTimersByTime(4000);
      fixture.detectChanges();
      expect(el.querySelector('.info')?.textContent).toContain('Le service se réveille');
    } finally {
      vi.useRealTimers();
    }
  });

  it('envoie les fichiers choisis et recharge la liste', async () => {
    await render();
    const input = el.querySelector<HTMLInputElement>('input[type="file"]')!;
    const files = [new File(['a'], 'a.pdf'), new File(['b'], 'b.png')];
    Object.defineProperty(input, 'files', { value: files });
    input.dispatchEvent(new Event('change'));
    await settle();
    expect(api.upload).toHaveBeenCalledTimes(2);
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(status()).toBe('2 documents ajoutés.');
  });

  it('accepte le glisser-déposer et signale les fichiers refusés', async () => {
    await render();
    const drop = el.querySelector<HTMLElement>('.drop')!;

    drop.dispatchEvent(new Event('dragover'));
    await settle();
    expect(drop.classList).toContain('over');
    drop.dispatchEvent(new Event('dragleave'));
    await settle();
    expect(drop.classList).not.toContain('over');

    api.upload
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new HttpErrorResponse({ status: 413 }));
    const event = new Event('drop', { cancelable: true });
    Object.defineProperty(event, 'dataTransfer', {
      value: { files: [new File(['a'], 'ok.pdf'), new File(['b'], 'gros.pdf')] },
    });
    drop.dispatchEvent(event);
    await settle();
    expect(event.defaultPrevented).toBe(true);
    expect(api.upload).toHaveBeenCalledTimes(2);
    expect(status()).toBe('Document ajouté.');
  });

  it('n’annonce rien si aucun fichier n’a pu être envoyé', async () => {
    await render();
    api.upload.mockRejectedValue(new HttpErrorResponse({ status: 415 }));
    const input = el.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'x.exe')] });
    input.dispatchEvent(new Event('change'));
    await settle();
    expect(el.querySelector('.error')?.textContent).toContain('x.exe : Requête refusée.');
    expect(api.list).toHaveBeenCalledTimes(1);
  });

  it('se déconnecte', async () => {
    await render();
    button('Déconnexion').click();
    await settle();
    expect(session.logout).toHaveBeenCalledOnce();
  });
});

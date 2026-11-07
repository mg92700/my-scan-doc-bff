import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { SessionService } from '../../core/session/session.service';
import { DocumentPage, DocumentView } from './document.model';
import { Documents } from './documents';
import { DocumentsService } from './documents.service';

function makeDoc(id: string, name: string, contentType = 'application/pdf'): DocumentView {
  return { id, name, size: 2048, contentType, createdAt: '2026-01-01T10:00:00Z', archivedAt: null };
}

function pageOf(items: DocumentView[], total = items.length, offset = 0, limit = 10): DocumentPage {
  return { items, total, offset, limit };
}

const manyDocs = (n: number, from = 1) =>
  Array.from({ length: n }, (_, i) => makeDoc(String(from + i), `doc-${from + i}.pdf`));

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
        .mockResolvedValue(
          pageOf([makeDoc('1', 'facture.pdf'), makeDoc('2', 'photos.zip', 'application/zip')]),
        ),
      suggestions: vi.fn().mockReturnValue(of([])),
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
  const searchBox = () => el.querySelector<HTMLInputElement>('input[type="search"]')!;
  const options = () => Array.from(el.querySelectorAll<HTMLElement>('[role="option"]'));
  function button(label: string, scope: ParentNode = el): HTMLButtonElement {
    const found = Array.from(scope.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === label,
    );
    if (!found) throw new Error(`Bouton « ${label} » introuvable`);
    return found;
  }

  /** Tape dans la recherche ; avance l'horloge pour passer la pause avant les suggestions. */
  async function type(text: string): Promise<void> {
    vi.useFakeTimers();
    try {
      searchBox().value = text;
      searchBox().dispatchEvent(new Event('input'));
      vi.advanceTimersByTime(250);
    } finally {
      vi.useRealTimers();
    }
    await settle();
  }

  const press = async (key: string) => {
    searchBox().dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }));
    await settle();
  };

  it('affiche l’utilisateur et la liste des documents', async () => {
    await render();
    expect(api.list).toHaveBeenCalledWith(false, '', 0, 10);
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

  it('affiche un message quand la liste est vide', async () => {
    api.list.mockResolvedValue(pageOf([]));
    await render();
    expect(el.querySelector('.empty')?.textContent).toContain('Aucun document.');
    expect(el.querySelector('.pager')).toBeNull();
  });

  // --- Recherche et autocomplétion ---------------------------------------------

  it('propose des suggestions après une pause de frappe', async () => {
    api.suggestions.mockReturnValue(of(['facture.pdf', 'facture-eau.pdf']));
    await render();
    await type('fa');
    expect(api.suggestions).toHaveBeenCalledWith('fa', false);
    expect(options().map((o) => o.textContent?.trim())).toEqual(['facture.pdf', 'facture-eau.pdf']);
    expect(searchBox().getAttribute('aria-expanded')).toBe('true');
  });

  it('ne propose rien sous deux lettres', async () => {
    await render();
    await type('f');
    expect(api.suggestions).not.toHaveBeenCalled();
    expect(options()).toHaveLength(0);
  });

  it('choisir une suggestion lance la recherche depuis la première page', async () => {
    api.suggestions.mockReturnValue(of(['facture.pdf']));
    await render();
    await type('fa');
    options()[0].dispatchEvent(new Event('mousedown', { cancelable: true }));
    await settle();
    expect(api.list).toHaveBeenLastCalledWith(false, 'facture.pdf', 0, 10);
    expect(searchBox().value).toBe('facture.pdf');
    expect(options()).toHaveLength(0);
  });

  it('se commande au clavier : flèches, Entrée, Échap', async () => {
    api.suggestions.mockReturnValue(of(['a.pdf', 'b.pdf', 'c.pdf']));
    await render();
    await type('ab');

    await press('ArrowDown');
    await press('ArrowDown');
    expect(options()[1].classList).toContain('active');
    expect(searchBox().getAttribute('aria-activedescendant')).toBe('suggestion-1');
    await press('ArrowUp');
    expect(options()[0].classList).toContain('active');
    await press('ArrowUp'); // revient à la dernière
    expect(options()[2].classList).toContain('active');

    await press('Escape');
    expect(options()).toHaveLength(0);

    await press('ArrowDown'); // rouvre
    expect(options().length).toBeGreaterThan(0);
    await press('Enter');
    expect(api.list).toHaveBeenLastCalledWith(false, expect.stringMatching(/\.pdf$/), 0, 10);
  });

  it('Entrée sans suggestion choisie applique le texte tapé, sans espaces autour', async () => {
    await render();
    await type('  facture ');
    await press('Enter');
    expect(api.list).toHaveBeenLastCalledWith(false, 'facture', 0, 10);
  });

  it('une touche sans effet ne change rien', async () => {
    await render();
    const before = api.list.mock.calls.length;
    await press('a');
    await press('ArrowDown'); // aucune suggestion : rien à parcourir
    expect(api.list.mock.calls.length).toBe(before);
  });

  it('affiche « aucun résultat » puis efface la recherche', async () => {
    await render();
    api.list.mockResolvedValueOnce(pageOf([]));
    await type('zzz');
    await press('Enter');
    expect(el.querySelector('.empty')?.textContent).toContain('Aucun résultat pour « zzz ».');

    el.querySelector<HTMLButtonElement>('button.clear')!.click();
    await settle();
    expect(api.list).toHaveBeenLastCalledWith(false, '', 0, 10);
    expect(searchBox().value).toBe('');
  });

  it('vider le champ rétablit la liste complète', async () => {
    await render();
    await type('facture');
    await press('Enter');
    await type('');
    expect(api.list).toHaveBeenLastCalledWith(false, '', 0, 10);
  });

  it('changer d’onglet réinitialise la recherche et la page', async () => {
    await render();
    await type('facture');
    await press('Enter');
    api.list.mockResolvedValueOnce(pageOf([makeDoc('3', 'vieux.pdf')]));
    button('Archives').click();
    await settle();
    expect(api.list).toHaveBeenLastCalledWith(true, '', 0, 10);
    expect(searchBox().value).toBe('');
  });

  // --- Pagination ------------------------------------------------------------------

  it('affiche la position et navigue de page en page', async () => {
    api.list.mockResolvedValue(pageOf(manyDocs(10), 25));
    await render();
    expect(el.querySelector('.pager')?.textContent).toContain('1–10 sur 25');
    expect(el.querySelector('.pager')?.textContent).toContain('Page 1 / 3');
    expect(button('Précédent').disabled).toBe(true);
    expect(button('Suivant').disabled).toBe(false);

    api.list.mockResolvedValue(pageOf(manyDocs(10, 11), 25, 10));
    button('Suivant').click();
    await settle();
    expect(api.list).toHaveBeenLastCalledWith(false, '', 10, 10);
    expect(el.querySelector('.pager')?.textContent).toContain('11–20 sur 25');
    expect(button('Précédent').disabled).toBe(false);

    api.list.mockResolvedValue(pageOf(manyDocs(5, 21), 25, 20));
    button('Suivant').click();
    await settle();
    expect(el.querySelector('.pager')?.textContent).toContain('21–25 sur 25');
    expect(button('Suivant').disabled).toBe(true);

    api.list.mockResolvedValue(pageOf(manyDocs(10, 11), 25, 10));
    button('Précédent').click();
    await settle();
    expect(api.list).toHaveBeenLastCalledWith(false, '', 10, 10);
  });

  it('ne dépasse jamais les bornes avec Suivant / Précédent', async () => {
    await render();
    const before = api.list.mock.calls.length;
    (component() as unknown as { next(): void; previous(): void }).next();
    (component() as unknown as { next(): void; previous(): void }).previous();
    await settle();
    expect(api.list.mock.calls.length).toBe(before);
  });

  const component = () => fixture.componentInstance;

  it('change le nombre de documents par page et revient au début', async () => {
    api.list.mockResolvedValue(pageOf(manyDocs(10), 25));
    await render();
    const select = el.querySelector<HTMLSelectElement>('.per-page select')!;
    select.value = select.options[1].value; // 20
    select.dispatchEvent(new Event('change'));
    await settle();
    expect(api.list).toHaveBeenLastCalledWith(false, '', 0, 20);
  });

  it('revient à la dernière page quand elle se vide après une suppression', async () => {
    api.list.mockResolvedValue(pageOf(manyDocs(10), 11));
    await render();
    api.list.mockResolvedValue(pageOf([makeDoc('11', 'doc-11.pdf')], 11, 10));
    button('Suivant').click();
    await settle();

    // après la suppression, le serveur n'a plus que 10 documents : la page 2 est vide
    api.list
      .mockResolvedValueOnce(pageOf([], 10, 10))
      .mockResolvedValue(pageOf(manyDocs(10), 10, 0));
    button('Supprimer', rows()[0]).click();
    await settle();
    button('Oui, supprimer', rows()[0]).click();
    await settle();

    expect(api.list).toHaveBeenLastCalledWith(false, '', 0, 10);
    expect(rows()).toHaveLength(10);
  });

  // --- Actions ------------------------------------------------------------------------

  it('bascule sur les archives et peut restaurer', async () => {
    await render();
    api.list
      .mockResolvedValueOnce(pageOf([makeDoc('3', 'vieux.pdf')]))
      .mockResolvedValueOnce(pageOf([]));
    button('Archives').click();
    await settle();
    expect(api.list).toHaveBeenLastCalledWith(true, '', 0, 10);
    expect(el.querySelector('.drop')).toBeNull();

    button('Restaurer').click();
    await settle();
    expect(api.unarchive).toHaveBeenCalledWith('3');
    expect(status()).toBe('Document restauré.');
    expect(el.querySelector('.empty')?.textContent).toContain('Aucun document archivé.');
  });

  it('archive un document puis recharge la page', async () => {
    await render();
    api.list.mockResolvedValueOnce(pageOf([makeDoc('2', 'photos.zip', 'application/zip')]));
    button('Archiver', rows()[0]).click();
    await settle();
    expect(api.archive).toHaveBeenCalledWith('1');
    expect(api.list).toHaveBeenCalledTimes(2);
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
    api.list.mockResolvedValueOnce(pageOf([makeDoc('2', 'photos.zip', 'application/zip')]));
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

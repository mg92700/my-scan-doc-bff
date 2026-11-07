import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { DocumentsService, PAGE_SIZES, errorMessage } from './documents.service';
import { formatSize, kindOf } from '../../shared/utils/format';
import { DocumentView } from './document.model';
import { SessionService } from '../../core/session/session.service';
import { ApiStatusService } from '../../core/api-status/api-status.service';

/** Nombre de lettres à partir duquel on propose des suggestions. */
const MIN_SUGGEST_LENGTH = 2;
/** Pause après la dernière frappe avant d'interroger le serveur. */
const SUGGEST_DEBOUNCE_MS = 250;

/** Message affiché après une action de l'utilisateur. */
interface Notice {
  kind: 'error' | 'success';
  text: string;
}

@Component({
  selector: 'app-documents',
  imports: [DatePipe, FormsModule],
  templateUrl: './documents.html',
  styleUrl: './documents.css',
})
export class Documents {
  protected readonly session = inject(SessionService);
  private readonly api = inject(DocumentsService);
  private readonly apiStatus = inject(ApiStatusService);

  protected readonly archived = signal(false);
  protected readonly documents = signal<DocumentView[]>([]);
  protected readonly total = signal(0);
  protected readonly offset = signal(0);
  protected readonly pageSizes = PAGE_SIZES;
  protected readonly pageSize = signal<number>(PAGE_SIZES[0]);
  /** Texte tapé dans le champ de recherche. */
  protected readonly query = signal('');
  /** Recherche réellement appliquée à la liste (après Entrée ou choix d'une suggestion). */
  protected readonly appliedQuery = signal('');
  protected readonly suggestions = signal<string[]>([]);
  protected readonly suggestionsOpen = signal(false);
  protected readonly activeIndex = signal(-1);
  private readonly typed$ = new Subject<string>();
  protected readonly loading = signal(false);
  protected readonly slow = signal(false);
  protected readonly dragging = signal(false);
  protected readonly busyId = signal<string | null>(null);
  protected readonly confirming = signal<string | null>(null);
  protected readonly notice = signal<Notice | null>(null);

  protected readonly initial = computed(() => this.session.user()?.charAt(0) ?? '?');

  protected readonly page = computed(() => Math.floor(this.offset() / this.pageSize()) + 1);
  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.total() / this.pageSize())),
  );
  protected readonly rangeFrom = computed(() => (this.total() === 0 ? 0 : this.offset() + 1));
  protected readonly rangeTo = computed(() => this.offset() + this.documents().length);
  protected readonly hasPrevious = computed(() => this.offset() > 0);
  protected readonly hasNext = computed(() => this.rangeTo() < this.total());

  constructor() {
    void this.reload();
    // Suggestions : pause de 250 ms, pas de requête pour un texte inchangé ou trop court,
    // et la requête précédente est annulée si l'utilisateur continue de taper.
    this.typed$
      .pipe(
        debounceTime(SUGGEST_DEBOUNCE_MS),
        map((q) => q.trim()),
        distinctUntilChanged(),
        switchMap((q) =>
          q.length < MIN_SUGGEST_LENGTH
            ? of<string[]>([])
            : this.api.suggestions(q, this.archived()),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((names) => {
        this.suggestions.set(names);
        this.activeIndex.set(-1);
      });
    // L'API dormait au premier chargement : on recharge la liste dès qu'elle est réveillée.
    let seen = 0;
    effect(() => {
      const n = this.apiStatus.recovered();
      if (n > seen) {
        seen = n;
        untracked(() => void this.reload());
      }
    });
  }

  protected kind(d: DocumentView): string {
    return kindOf(d.contentType);
  }

  protected size(d: DocumentView): string {
    return formatSize(d.size);
  }

  protected show(archived: boolean): void {
    this.archived.set(archived);
    this.documents.set([]);
    this.total.set(0);
    this.offset.set(0);
    this.query.set('');
    this.appliedQuery.set('');
    this.suggestions.set([]);
    this.confirming.set(null);
    this.notice.set(null);
    void this.reload();
  }

  // --- Recherche avec suggestions -------------------------------------------

  protected onSearchInput(value: string): void {
    this.query.set(value);
    this.suggestionsOpen.set(true);
    this.typed$.next(value);
    if (value.trim() === '') {
      this.suggestions.set([]);
      if (this.appliedQuery() !== '') this.applySearch(''); // champ vidé : retour à la liste complète
    }
  }

  protected onSearchKey(event: KeyboardEvent): void {
    const count = this.suggestions().length;
    switch (event.key) {
      case 'ArrowDown':
        if (count > 0) {
          event.preventDefault();
          this.suggestionsOpen.set(true);
          this.activeIndex.update((i) => (i + 1) % count);
        }
        break;
      case 'ArrowUp':
        if (count > 0) {
          event.preventDefault();
          this.activeIndex.update((i) => (i <= 0 ? count - 1 : i - 1));
        }
        break;
      case 'Enter': {
        event.preventDefault();
        const i = this.activeIndex();
        this.applySearch(this.suggestionsOpen() && i >= 0 ? this.suggestions()[i] : this.query());
        break;
      }
      case 'Escape':
        this.closeSuggestions();
        break;
    }
  }

  protected closeSuggestions(): void {
    this.suggestionsOpen.set(false);
    this.activeIndex.set(-1);
  }

  /** Applique la recherche à la liste et revient à la première page. */
  protected applySearch(text: string): void {
    this.query.set(text);
    this.appliedQuery.set(text.trim());
    this.offset.set(0);
    this.suggestions.set([]);
    this.closeSuggestions();
    this.notice.set(null);
    void this.reload();
  }

  protected clearSearch(): void {
    this.applySearch('');
  }

  // --- Pagination -------------------------------------------------------------

  protected next(): void {
    if (this.hasNext()) this.goTo(this.offset() + this.pageSize());
  }

  protected previous(): void {
    if (this.hasPrevious()) this.goTo(Math.max(0, this.offset() - this.pageSize()));
  }

  protected changePageSize(size: number): void {
    this.pageSize.set(Number(size));
    this.goTo(0);
  }

  private goTo(offset: number): void {
    this.offset.set(offset);
    this.confirming.set(null);
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.loading.set(true);
    const timer = setTimeout(() => this.slow.set(true), 4000); // l'API gratuite s'endort après 15 min
    try {
      const page = await this.api.list(
        this.archived(),
        this.appliedQuery(),
        this.offset(),
        this.pageSize(),
      );
      if (page.items.length === 0 && page.total > 0 && this.offset() > 0) {
        // La dernière page vient de se vider (suppression, archivage) : retour à la dernière page existante
        this.offset.set(Math.floor((page.total - 1) / this.pageSize()) * this.pageSize());
        return await this.reload();
      }
      this.documents.set(page.items);
      this.total.set(page.total);
    } catch (e) {
      this.fail(e);
    } finally {
      clearTimeout(timer);
      this.slow.set(false);
      this.loading.set(false);
    }
  }

  protected onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    void this.upload(Array.from(input.files ?? []));
    input.value = '';
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    void this.upload(Array.from(event.dataTransfer?.files ?? []));
  }

  protected async download(d: DocumentView): Promise<void> {
    await this.run(d, () => this.api.download(d));
  }

  protected async toggleArchive(d: DocumentView): Promise<void> {
    const archiving = !this.archived();
    await this.run(d, async () => {
      await (archiving ? this.api.archive(d.id) : this.api.unarchive(d.id));
      this.notice.set({
        kind: 'success',
        text: archiving ? 'Document archivé.' : 'Document restauré.',
      });
      await this.reload(); // les documents suivants remontent : on recharge la page courante
    });
  }

  protected async remove(d: DocumentView): Promise<void> {
    await this.run(d, async () => {
      await this.api.remove(d.id);
      this.confirming.set(null);
      this.notice.set({ kind: 'success', text: 'Document supprimé.' });
      await this.reload();
    });
  }

  protected async logout(): Promise<void> {
    await this.session.logout();
  }

  private async upload(files: File[]): Promise<void> {
    let ok = 0;
    for (const file of files) {
      try {
        await this.api.upload(file);
        ok++;
      } catch (e) {
        this.fail(e, `${file.name} : `);
      }
    }
    if (ok > 0) {
      this.notice.set({
        kind: 'success',
        text: ok === 1 ? 'Document ajouté.' : `${ok} documents ajoutés.`,
      });
      await this.reload();
    }
  }

  private async run(d: DocumentView, action: () => Promise<void>): Promise<void> {
    this.busyId.set(d.id);
    this.notice.set(null);
    try {
      await action();
    } catch (e) {
      this.fail(e);
    } finally {
      this.busyId.set(null);
    }
  }

  private fail(e: unknown, prefix = ''): void {
    this.notice.set({ kind: 'error', text: prefix + errorMessage(e) });
  }
}

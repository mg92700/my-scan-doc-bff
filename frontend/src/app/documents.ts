import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DocumentsService, errorMessage } from './documents.service';
import { formatSize, kindOf } from './format';
import { DocumentView } from './models';
import { SessionService } from './session.service';

@Component({
  selector: 'app-documents',
  imports: [DatePipe, FormsModule],
  template: `
    <header class="bar">
      <strong>My Scan Doc</strong>
      <span class="spacer"></span>
      <span class="muted">{{ session.user() }}</span>
      <button (click)="logout()">Déconnexion</button>
    </header>

    <main class="page">
      <nav class="tabs" aria-label="Affichage">
        <button [class.active]="!archived()" (click)="show(false)">Documents</button>
        <button [class.active]="archived()" (click)="show(true)">Archives</button>
      </nav>

      @if (!archived()) {
        <section class="drop" [class.over]="dragging()"
                 (dragover)="$event.preventDefault(); dragging.set(true)"
                 (dragleave)="dragging.set(false)"
                 (drop)="onDrop($event)">
          <p>Déposez un PDF ou une image ici, ou</p>
          <label class="button primary">
            Choisir un fichier
            <input type="file" hidden multiple accept="application/pdf,image/*" (change)="onPick($event)" />
          </label>
          <p class="muted small">Les images sont converties en PDF (ou archivées en ZIP si ce n'est pas possible). 20 Mo maximum.</p>
        </section>
      }

      @if (message(); as m) {
        <p [class]="m.kind" role="status">{{ m.text }}</p>
      }
      @if (slow()) {
        <p class="info" role="status">Le service se réveille, cela peut prendre jusqu'à une minute…</p>
      }

      <input class="search" type="search" placeholder="Rechercher par nom" aria-label="Rechercher"
             [ngModel]="query()" (ngModelChange)="query.set($event)" />

      @if (loading() && documents().length === 0) {
        <p class="muted">Chargement…</p>
      } @else if (visible().length === 0) {
        <p class="muted empty">{{ archived() ? 'Aucun document archivé.' : 'Aucun document.' }}</p>
      } @else {
        <table>
          <thead>
            <tr><th>Nom</th><th>Type</th><th>Taille</th><th>Ajouté le</th><th class="right">Actions</th></tr>
          </thead>
          <tbody>
            @for (d of visible(); track d.id) {
              <tr>
                <td class="name" [title]="d.name">{{ d.name }}</td>
                <td><span class="badge">{{ kind(d) }}</span></td>
                <td>{{ size(d) }}</td>
                <td>{{ d.createdAt | date: 'dd/MM/yyyy HH:mm' }}</td>
                <td class="right actions">
                  @if (confirming() === d.id) {
                    <span>Supprimer définitivement ?</span>
                    <button class="danger" (click)="remove(d)" [disabled]="busyId() === d.id">Oui, supprimer</button>
                    <button (click)="confirming.set(null)">Annuler</button>
                  } @else {
                    <button (click)="download(d)" [disabled]="busyId() === d.id">Télécharger</button>
                    @if (archived()) {
                      <button (click)="toggleArchive(d)" [disabled]="busyId() === d.id">Restaurer</button>
                    } @else {
                      <button (click)="toggleArchive(d)" [disabled]="busyId() === d.id">Archiver</button>
                    }
                    <button class="danger" (click)="confirming.set(d.id)" [disabled]="busyId() === d.id">Supprimer</button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </main>
  `,
})
export class Documents {
  protected readonly session = inject(SessionService);
  private readonly api = inject(DocumentsService);

  protected readonly archived = signal(false);
  protected readonly documents = signal<DocumentView[]>([]);
  protected readonly query = signal('');
  protected readonly loading = signal(false);
  protected readonly slow = signal(false);
  protected readonly dragging = signal(false);
  protected readonly busyId = signal<string | null>(null);
  protected readonly confirming = signal<string | null>(null);
  protected readonly message = signal<{ kind: 'error' | 'success'; text: string } | null>(null);

  protected readonly visible = computed(() => {
    const q = this.query().trim().toLowerCase();
    return q ? this.documents().filter((d) => d.name.toLowerCase().includes(q)) : this.documents();
  });

  constructor() {
    void this.reload();
  }

  protected kind = (d: DocumentView) => kindOf(d.contentType);
  protected size = (d: DocumentView) => formatSize(d.size);

  protected show(archived: boolean): void {
    this.archived.set(archived);
    this.documents.set([]);
    this.confirming.set(null);
    this.message.set(null);
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.loading.set(true);
    const timer = setTimeout(() => this.slow.set(true), 4000); // l'API gratuite s'endort après 15 min
    try {
      this.documents.set(await this.api.list(this.archived()));
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
      this.message.set({ kind: 'success', text: ok === 1 ? 'Document ajouté.' : `${ok} documents ajoutés.` });
      await this.reload();
    }
  }

  protected async download(d: DocumentView): Promise<void> {
    await this.run(d, () => this.api.download(d));
  }

  protected async toggleArchive(d: DocumentView): Promise<void> {
    const archiving = !this.archived();
    await this.run(d, async () => {
      await (archiving ? this.api.archive(d.id) : this.api.unarchive(d.id));
      this.documents.update((list) => list.filter((x) => x.id !== d.id));
      this.message.set({ kind: 'success', text: archiving ? 'Document archivé.' : 'Document restauré.' });
    });
  }

  protected async remove(d: DocumentView): Promise<void> {
    await this.run(d, async () => {
      await this.api.remove(d.id);
      this.documents.update((list) => list.filter((x) => x.id !== d.id));
      this.confirming.set(null);
      this.message.set({ kind: 'success', text: 'Document supprimé.' });
    });
  }

  protected async logout(): Promise<void> {
    await this.session.logout();
  }

  private async run(d: DocumentView, action: () => Promise<void>): Promise<void> {
    this.busyId.set(d.id);
    this.message.set(null);
    try {
      await action();
    } catch (e) {
      this.fail(e);
    } finally {
      this.busyId.set(null);
    }
  }

  private fail(e: unknown, prefix = ''): void {
    this.message.set({ kind: 'error', text: prefix + errorMessage(e) });
  }
}

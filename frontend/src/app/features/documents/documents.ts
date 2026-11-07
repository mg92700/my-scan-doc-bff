import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DocumentsService, errorMessage } from './documents.service';
import { formatSize, kindOf } from '../../shared/utils/format';
import { DocumentView } from './document.model';
import { SessionService } from '../../core/session/session.service';
import { ApiStatusService } from '../../core/api-status/api-status.service';

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
  protected readonly query = signal('');
  protected readonly loading = signal(false);
  protected readonly slow = signal(false);
  protected readonly dragging = signal(false);
  protected readonly busyId = signal<string | null>(null);
  protected readonly confirming = signal<string | null>(null);
  protected readonly notice = signal<Notice | null>(null);

  protected readonly initial = computed(() => this.session.user()?.charAt(0) ?? '?');

  protected readonly visible = computed(() => {
    const q = this.query().trim().toLowerCase();
    return q ? this.documents().filter((d) => d.name.toLowerCase().includes(q)) : this.documents();
  });

  constructor() {
    void this.reload();
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
    this.confirming.set(null);
    this.notice.set(null);
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

  protected async download(d: DocumentView): Promise<void> {
    await this.run(d, () => this.api.download(d));
  }

  protected async toggleArchive(d: DocumentView): Promise<void> {
    const archiving = !this.archived();
    await this.run(d, async () => {
      await (archiving ? this.api.archive(d.id) : this.api.unarchive(d.id));
      this.documents.update((list) => list.filter((x) => x.id !== d.id));
      this.notice.set({
        kind: 'success',
        text: archiving ? 'Document archivé.' : 'Document restauré.',
      });
    });
  }

  protected async remove(d: DocumentView): Promise<void> {
    await this.run(d, async () => {
      await this.api.remove(d.id);
      this.documents.update((list) => list.filter((x) => x.id !== d.id));
      this.confirming.set(null);
      this.notice.set({ kind: 'success', text: 'Document supprimé.' });
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

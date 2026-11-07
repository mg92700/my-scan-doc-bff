import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DocumentView } from './models';

const BASE = '/bff/documents';

@Injectable({ providedIn: 'root' })
export class DocumentsService {
  private readonly http = inject(HttpClient);

  list(archived: boolean): Promise<DocumentView[]> {
    return firstValueFrom(this.http.get<DocumentView[]>(BASE, { params: { archived } }));
  }

  archive(id: string): Promise<DocumentView> {
    return firstValueFrom(this.http.post<DocumentView>(`${BASE}/${id}/archive`, {}));
  }

  unarchive(id: string): Promise<DocumentView> {
    return firstValueFrom(this.http.post<DocumentView>(`${BASE}/${id}/unarchive`, {}));
  }

  remove(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${BASE}/${id}`));
  }

  upload(file: File): Promise<DocumentView> {
    const form = new FormData();
    form.append('file', file, file.name);
    return firstValueFrom(this.http.post<DocumentView>(BASE, form));
  }

  /** Télécharge le fichier via le BFF puis déclenche l'enregistrement dans le navigateur. */
  async download(doc: DocumentView): Promise<void> {
    const res = await firstValueFrom(
      this.http.get(`${BASE}/${doc.id}/download`, { observe: 'response', responseType: 'blob' }),
    );
    const name = filenameFrom(res.headers.get('Content-Disposition')) ?? doc.name;
    const url = URL.createObjectURL(res.body as Blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }
}

/** Extrait le nom de fichier d'un en-tête Content-Disposition (RFC 5987 : filename*=UTF-8''...). */
export function filenameFrom(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      return null;
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1] : null;
}

/** Message lisible pour une erreur HTTP renvoyée par le BFF. */
export function errorMessage(e: unknown): string {
  const err = e as HttpErrorResponse;
  if (err?.status === 504 || err?.status === 502) {
    return err.error?.message ?? 'Le service documents est indisponible, réessayez dans un instant.';
  }
  if (err?.status === 400 || err?.status === 404 || err?.status === 413 || err?.status === 415) {
    return err.error?.message ?? 'Requête refusée.';
  }
  if (err?.status === 0) return 'Serveur injoignable.';
  return 'Une erreur est survenue.';
}

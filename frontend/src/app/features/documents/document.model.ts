/** Document tel que renvoyé par le BFF (jamais de clé de stockage ni de SHA-256). */
export interface DocumentView {
  id: string;
  name: string;
  size: number;
  contentType: string;
  createdAt: string;
  archivedAt: string | null;
}

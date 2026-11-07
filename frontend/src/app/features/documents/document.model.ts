/** Document tel que renvoyé par le BFF (jamais de clé de stockage ni de SHA-256). */
export interface DocumentView {
  id: string;
  name: string;
  size: number;
  contentType: string;
  createdAt: string;
  archivedAt: string | null;
}

/** Une page de résultats renvoyée par le BFF (décalage + taille, comme dans l'API). */
export interface DocumentPage {
  items: DocumentView[];
  total: number;
  offset: number;
  limit: number;
}

import { HttpErrorResponse } from '@angular/common/http';
import { errorMessage, filenameFrom } from './documents.service';

describe('documents.service helpers', () => {
  it('extrait le nom RFC 5987', () => {
    expect(filenameFrom("attachment; filename*=UTF-8''Facture%20%C3%A9t%C3%A9.pdf")).toBe('Facture été.pdf');
  });

  it('extrait le nom simple et gère l’absence', () => {
    expect(filenameFrom('attachment; filename="a.pdf"')).toBe('a.pdf');
    expect(filenameFrom(null)).toBeNull();
    expect(filenameFrom('inline')).toBeNull();
  });

  it('traduit les erreurs HTTP', () => {
    const e = (status: number, error?: unknown) => new HttpErrorResponse({ status, error });
    expect(errorMessage(e(400, { message: 'Format non supporté' }))).toBe('Format non supporté');
    expect(errorMessage(e(504, { message: 'Ne répond pas' }))).toBe('Ne répond pas');
    expect(errorMessage(e(0))).toBe('Serveur injoignable.');
    expect(errorMessage(e(500))).toBe('Une erreur est survenue.');
  });
});

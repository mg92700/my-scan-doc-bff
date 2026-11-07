import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiStatus } from './api-status';

describe('ApiStatus', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ApiStatus], providers: [provideHttpClient(), provideHttpClientTesting()] });
  });

  async function render(flush: (req: HttpTestingController) => void): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(ApiStatus);
    const el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    expect(el.textContent).toContain('Vérification');
    flush(TestBed.inject(HttpTestingController));
    await new Promise((r) => setTimeout(r));
    fixture.detectChanges();
    fixture.destroy(); // arrête la vérification périodique
    return el;
  }

  it('affiche « disponible » quand l’API répond', async () => {
    const el = await render((h) => h.expectOne('/bff/api-status').flush({ status: 'UP' }));
    expect(el.textContent).toContain('API disponible');
    expect(el.querySelector('.up')).toBeTruthy();
  });

  it('affiche « en veille » quand l’API ne répond pas', async () => {
    const el = await render((h) => h.expectOne('/bff/api-status').flush({ status: 'DOWN' }));
    expect(el.textContent).toContain('en veille');
    expect(el.querySelector('.down')).toBeTruthy();
  });

  it('affiche « en veille » quand le BFF lui-même est injoignable', async () => {
    const el = await render((h) => h.expectOne('/bff/api-status').error(new ProgressEvent('error')));
    expect(el.textContent).toContain('en veille');
  });
});

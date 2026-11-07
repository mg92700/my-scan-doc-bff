import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SessionService } from '../../../core/session/session.service';
import { Login } from './login';

describe('Login', () => {
  let session: { login: ReturnType<typeof vi.fn> };
  let fixture: ComponentFixture<Login>;
  let el: HTMLElement;

  beforeEach(async () => {
    session = { login: vi.fn() };
    TestBed.configureTestingModule({
      imports: [Login],
      providers: [{ provide: SessionService, useValue: session }],
    });
    fixture = TestBed.createComponent(Login);
    el = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  const submitButton = () => el.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const passwordInput = () => el.querySelector<HTMLInputElement>('input[name="password"]')!;

  async function type(name: string, value: string): Promise<void> {
    const input = el.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  async function submit(): Promise<void> {
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
  }

  it('désactive le bouton tant que le formulaire est incomplet', async () => {
    expect(submitButton().disabled).toBe(true);
    await type('username', 'owner');
    expect(submitButton().disabled).toBe(true);
    await type('password', 'secret');
    expect(submitButton().disabled).toBe(false);
  });

  it('transmet les identifiants et vide le mot de passe', async () => {
    session.login.mockResolvedValue(null);
    await type('username', 'owner');
    await type('password', 'secret');
    await submit();
    expect(session.login).toHaveBeenCalledWith('owner', 'secret');
    expect(passwordInput().value).toBe('');
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('affiche l’erreur renvoyée par la session', async () => {
    session.login.mockResolvedValue('Identifiants invalides.');
    await type('username', 'owner');
    await type('password', 'mauvais');
    await submit();
    expect(el.querySelector('[role="alert"]')?.textContent).toBe('Identifiants invalides.');
  });

  it('indique la connexion en cours', async () => {
    let finish!: (value: string | null) => void;
    session.login.mockReturnValue(new Promise((r) => (finish = r)));
    await type('username', 'owner');
    await type('password', 'secret');
    await submit();
    expect(submitButton().textContent?.trim()).toBe('Connexion…');
    expect(submitButton().disabled).toBe(true);

    finish(null);
    await new Promise((r) => setTimeout(r));
    await fixture.whenStable();
    expect(submitButton().textContent?.trim()).toBe('Se connecter');
  });
});

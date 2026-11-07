# Front de my-scan-doc

Application Angular 21 qui affiche, envoie, archive et supprime les documents scannés.
Elle ne parle **qu'au BFF** (`/bff/...`), jamais directement à l'API : la session et les
secrets restent côté serveur. Le lancement complet (back + front) est décrit dans le
[`README.md` à la racine](../README.md).

## Sommaire

1. [Démarrage rapide](#démarrage-rapide)
2. [Commandes](#commandes)
3. [Organisation du code](#organisation-du-code)
4. [Fonctionnement](#fonctionnement)
5. [Design et thème](#design-et-thème)
6. [Mobile](#mobile)
7. [Tests](#tests)
8. [Conventions](#conventions)
9. [Ajouter une fonctionnalité](#ajouter-une-fonctionnalité)
10. [Contraintes de sécurité](#contraintes-de-sécurité)

## Démarrage rapide

Prérequis : Node 20.19+, 22.12+ ou 24+ (le Docker utilise Node 22) et le BFF lancé sur `http://localhost:8081`.

```bash
cd frontend
npm ci
npm start          # http://localhost:4200
```

Le serveur de développement relaie `/bff` et `/actuator` vers `http://localhost:8081`
(voir `proxy.conf.json`) : pas de souci de CORS ni de cookies en local.

## Commandes

| Commande                   | Rôle                                                     |
| -------------------------- | -------------------------------------------------------- |
| `npm start`                | Serveur de développement avec rechargement automatique   |
| `npm run build`            | Build de production dans `dist/frontend/browser`         |
| `npm run watch`            | Build de développement recompilé à chaque modification   |
| `npm test`                 | Tests unitaires (Vitest) en mode surveillance            |
| `npm run test:coverage`    | Tests une seule fois + couverture ; **échoue sous 80 %** |
| `npx prettier --write src` | Formate le code selon `.prettierrc`                      |

En production, le `Dockerfile` à la racine compile le front et copie `dist/frontend/browser`
dans les ressources statiques du back : un seul service sert tout.

## Organisation du code

```
src/
├── index.html              page hôte (langue, viewport mobile, couleur du navigateur)
├── main.ts                 démarrage de l'application
├── styles.css              jetons de couleurs + styles de base partagés (boutons, champs, messages)
└── app/
    ├── app.ts              composant racine : écran de connexion OU documents
    ├── app.config.ts       fournisseurs globaux (HttpClient + intercepteur)
    │
    ├── core/               singletons transverses, chargés une seule fois
    │   ├── session/
    │   │   ├── session.service.ts       état de connexion (signal user), login / logout
    │   │   └── session.interceptor.ts   un 401 sur une route de données → retour au login
    │   └── api-status/
    │       └── api-status.*             pastille « API disponible / en veille »
    │
    ├── features/           un dossier par fonctionnalité métier
    │   ├── auth/login/
    │   │   └── login.*                  formulaire de connexion
    │   └── documents/
    │       ├── documents.*              page principale (liste, dépôt, actions)
    │       ├── documents.service.ts     appels HTTP vers /bff/documents
    │       └── document.model.ts        type DocumentView renvoyé par le BFF
    │
    └── shared/             code réutilisable sans dépendance métier
        └── utils/
            └── format.ts                formatSize (« 1,5 Ko »), kindOf (« PDF »)
```

`login.*` désigne `login.ts`, `login.html`, `login.css` et `login.spec.ts`, rangés côte à côte.

### Règles d'import

```
features/  ──►  core/  ──►  shared/
    └──────────────────────►  shared/
```

- `features/` peut importer `core/` et `shared/` ;
- `core/` peut importer `shared/`, jamais `features/` ;
- `shared/` n'importe rien du projet ;
- une feature n'importe **pas** une autre feature : si deux features ont besoin du même
  code, il descend dans `shared/` (ou dans `core/` s'il porte un état global).

## Fonctionnement

### Session

1. Au démarrage, `App` appelle `SessionService.restore()` → `GET /bff/session/me`.
   Cet appel pose aussi le cookie CSRF.
2. Tant que la réponse n'est pas arrivée (`ready() === false`), rien n'est affiché : on
   évite de montrer le formulaire de connexion une fraction de seconde pour rien.
3. `user()` non nul → page documents ; sinon → formulaire de connexion.
4. Si une route de données répond 401 (session expirée), `sessionInterceptor` appelle
   `session.expire()` et l'utilisateur revient au login.

Le jeton CSRF (cookie `XSRF-TOKEN` → en-tête `X-XSRF-TOKEN`) est géré automatiquement par
`HttpClient` : aucun code à écrire.

### Documents

| Action               | Méthode du service              | Route du BFF                         |
| -------------------- | ------------------------------- | ------------------------------------ |
| Lister               | `list(archived)`                | `GET /bff/documents?archived=…`      |
| Envoyer              | `upload(file)`                  | `POST /bff/documents` (multipart)    |
| Télécharger          | `download(doc)`                 | `GET /bff/documents/{id}/download`   |
| Archiver / restaurer | `archive(id)` / `unarchive(id)` | `POST /bff/documents/{id}/archive` … |
| Supprimer            | `remove(id)`                    | `DELETE /bff/documents/{id}`         |

- L'état de la page est entièrement en **signaux** (`signal`, `computed`). La recherche
  filtre localement la liste déjà chargée.
- La suppression demande une confirmation dans la ligne elle-même (pas de `confirm()` du
  navigateur).
- Les erreurs HTTP sont traduites en français par `errorMessage()`
  (`documents.service.ts`), qui reprend le message du BFF quand il en fournit un.
- L'API hébergée gratuitement s'endort : si la liste met plus de 4 s à arriver, un message
  prévient que le service se réveille. La pastille `api-status` interroge
  `/bff/api-status` toutes les 10 s tant que l'API dort, puis toutes les 60 s.

## Design et thème

Thème **clair**, **flat design** : aplats de couleur, aucune ombre ni dégradé.

Toutes les couleurs sont des variables CSS définies **une seule fois** dans
`src/styles.css` (`:root`). Les composants ne codent aucune couleur en dur : ils utilisent
`var(--…)`.

| Jetons                                                     | Usage                                      |
| ---------------------------------------------------------- | ------------------------------------------ |
| `--bg`, `--surface`, `--surface-alt`                       | fond de page, cartes, fonds secondaires    |
| `--text`, `--muted`, `--border`                            | texte, texte secondaire, bordures          |
| `--primary`, `--primary-hover`, `--primary-soft`           | actions principales, survol, fonds teintés |
| `--danger`, `--success`, `--info`, `--warning` (+ `-soft`) | états et messages                          |
| `--radius-sm`, `--radius`, `--radius-lg`                   | arrondis                                   |

Les couleurs de texte respectent un contraste **WCAG AA** (≥ 4,5:1) sur leur fond.

Classes partagées (`styles.css`) :

- `button.primary`, `button.danger`, `button.ghost` : variantes de bouton ;
- `.button` : un `<label>` qui ressemble à un bouton (sélecteur de fichier) ;
- `.error`, `.success`, `.info` : messages ;
- `.muted`, `.small` : texte secondaire ;
- `.icon` : icône SVG en ligne de 18 px, de la couleur du texte.

Pour ajouter un mode sombre : redéfinir les mêmes jetons dans
`@media (prefers-color-scheme: dark) { :root { … } }` et passer `color-scheme` à
`light dark` dans `index.html`. Aucun composant n'est à modifier.

## Mobile

L'interface est pensée d'abord pour le téléphone (point de rupture : **720 px**).

- **Cibles tactiles de 44 px minimum** sur les écrans tactiles (`pointer: coarse`).
- **Champs en 16 px** sur petit écran : en dessous, iOS zoome automatiquement au focus.
- **Tableau → cartes** : chaque document devient une carte (nom en gros ; type, taille et
  date sur une ligne ; boutons d'action en pleine largeur).
- **En-tête collant** en haut de l'écran ; le bouton de déconnexion n'affiche plus que son
  icône.
- **Onglets et recherche** en pleine largeur.
- **Zone de dépôt** : sur écran tactile, le texte « Déposez… » (le glisser-déposer n'y
  existe pas) est remplacé par « Ajoutez un PDF ou une photo », et le bouton prend toute la
  largeur. `accept="image/*"` permet de prendre une photo directement.
- **Encoches et barre de geste** : `viewport-fit=cover` + `env(safe-area-inset-*)` gardent
  le contenu et la pastille API hors des zones masquées.
- `100dvh` au lieu de `100vh`, pour que la barre d'adresse mobile ne coupe pas l'écran.

Pour vérifier : outils de développement du navigateur → mode appareil. L'iPhone SE
(375 px) est le cas le plus contraignant.

## Tests

Vitest + jsdom, lancés par le builder Angular (`ng test`). Chaque test est à côté du code
qu'il vérifie (`*.spec.ts`).

```bash
npm run test:coverage
```

La couverture est mesurée sur `src/app/**/*.ts` et doit rester **≥ 80 %** (instructions,
branches, fonctions, lignes). Les seuils sont dans `angular.json`
(`architect.test.options.coverageThresholds`) et le rapport HTML dans `coverage/`.

| Fichier de test               | Ce qui est vérifié                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `app.spec.ts`                 | Bascule login / documents selon la session                                                      |
| `session.service.spec.ts`     | restore, login (succès, refus, panne), logout, expire                                           |
| `session.interceptor.spec.ts` | Un 401 déconnecte, sauf sur les routes de session                                               |
| `api-status.spec.ts`          | Pastille disponible / en veille / BFF injoignable                                               |
| `login.spec.ts`               | Bouton désactivé, envoi, erreur affichée, état « Connexion… »                                   |
| `documents.spec.ts`           | Liste, recherche, archives, suppression confirmée, envoi, glisser-déposer, erreurs, réveil lent |
| `documents.service.spec.ts`   | Routes HTTP appelées, multipart, téléchargement, messages d'erreur                              |
| `format.spec.ts`              | Tailles et types de fichier                                                                     |

Principes :

- les composants sont testés **par le DOM** (on clique sur les boutons, on lit le texte),
  pas en appelant leurs méthodes `protected` ;
- les services HTTP sont testés avec `HttpTestingController` ; les composants reçoivent
  des services simulés (`vi.fn()`) via `providers` ;
- l'application est _zoneless_ : après une action, attendre `fixture.whenStable()`,
  précédé d'un `setTimeout` quand une promesse simulée doit d'abord se résoudre.

## Conventions

- **Nommage** (style guide Angular 20+) : fichiers en `kebab-case` sans suffixe
  (`login.ts`, pas `login.component.ts`) ; classes en `PascalCase` (`Login`,
  `DocumentsService`) ; sélecteurs préfixés par `app-`.
- **Composants autonomes** uniquement (pas de `NgModule`), avec `templateUrl` et
  `styleUrl` : ni template ni style en ligne.
- **Injection** avec `inject()`, pas par le constructeur.
- **État** en signaux. `protected` pour ce que le template utilise, `private` pour le
  reste, `readonly` dès que la référence ne change pas.
- **Syntaxe de contrôle** moderne : `@if`, `@for (… ; track …)`, pas de `*ngIf` / `*ngFor`.
- **TypeScript strict** (`tsconfig.json`) : types de retour explicites sur les méthodes,
  pas de `any`, un type nommé (`interface` / `type`) plutôt qu'un type littéral répété.
- **Format** : Prettier (`.prettierrc` : 100 colonnes, guillemets simples).
- **Textes** de l'interface et commentaires en français.
- **Budgets** : 4 ko de CSS par composant (avertissement), 500 ko pour le bundle initial.

## Ajouter une fonctionnalité

Exemple : une page « Paramètres ».

1. Créer `src/app/features/settings/` avec `settings.ts`, `settings.html`,
   `settings.css` et `settings.spec.ts` (`npx ng g c features/settings` le fait).
2. Mettre les appels HTTP dans `settings.service.ts`, dans le même dossier, et les types
   dans `settings.model.ts`.
3. Utiliser les jetons de `styles.css` et les classes partagées, sans couleur en dur.
4. Ajouter la route dans la **liste blanche** du BFF : le front ne peut appeler que ce que
   le BFF expose.
5. Vérifier que `npm run test:coverage` reste vert.

## Contraintes de sécurité

- La CSP du back interdit les scripts et gestionnaires d'événements **en ligne**. Le build
  désactive donc l'inlining des styles critiques (`angular.json`,
  `optimization.styles.inlineCritical: false`). Ne pas ajouter de `<script>` ni d'attribut
  `onclick` dans `index.html`.
- Aucun secret côté front : l'authentification repose sur un cookie de session
  `HttpOnly`, illisible en JavaScript.
- `noindex, nofollow` dans `index.html` : l'application est privée.

# Front de my-scan-doc

Angular 21, composants autonomes, signaux. Voir le `README.md` à la racine pour le lancement.

- `npm start` : serveur de développement (proxy `/bff` → `http://localhost:8081`, voir `proxy.conf.json`)
- `npm test` : tests (Vitest)
- `npm run build` : version de production dans `dist/frontend/browser`

La CSP du back interdit les scripts et gestionnaires d'événements en ligne : le build désactive donc l'inlining des styles critiques (`angular.json`).

## Organisation du code

```
src/
├── styles.css              jetons de couleurs (thème clair) + styles de base partagés
└── app/
    ├── app.ts / app.config.ts
    ├── core/               singletons transverses, chargés une seule fois
    │   ├── session/        SessionService + intercepteur 401
    │   └── api-status/     pastille d'état de l'API
    ├── features/           un dossier par fonctionnalité métier
    │   ├── auth/login/     écran de connexion
    │   └── documents/      liste, dépôt, archivage (composant, service, modèle)
    └── shared/             code réutilisable sans dépendance métier
        └── utils/          fonctions pures (formatage…)
```

Règles :

- un dossier par composant, avec `nom.ts`, `nom.html`, `nom.css` et `nom.spec.ts` côte à côte ;
- `features/` peut importer `core/` et `shared/`, jamais l'inverse ; une feature n'importe pas une autre feature ;
- les couleurs ne sont définies que dans `styles.css` (variables CSS), les composants les utilisent via `var(--…)`.

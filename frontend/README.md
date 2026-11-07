# Front de my-scan-doc

Angular 21, composants autonomes, signaux. Voir le `README.md` à la racine pour le lancement.

- `npm start` : serveur de développement (proxy `/bff` → `http://localhost:8081`, voir `proxy.conf.json`)
- `npm test` : tests (Vitest)
- `npm run build` : version de production dans `dist/frontend/browser`

La CSP du back interdit les scripts et gestionnaires d'événements en ligne : le build désactive donc l'inlining des styles critiques (`angular.json`).

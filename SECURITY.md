# 🔒 Sécurité — my-scan-doc-bff

## Principe

Le navigateur parle **uniquement** au BFF, avec un cookie de session. Seul le BFF connaît le compte de service et appelle `my-scan-doc-api`. Un attaquant qui vole le contenu du navigateur n'obtient jamais le jeton de l'API.

## Mesures

| # | Mesure | Où | Pourquoi |
|---|---|---|---|
| 1 | **Utilisateur unique dans `.env`**, mot de passe stocké en **hash BCrypt** ; démarrage refusé si absent ou non BCrypt | `SecurityConfig` | Aucun mot de passe en clair dans le code ni dans Git |
| 2 | **Cookie de session `HttpOnly`, `Secure`, `SameSite=Strict`** | `application.yml` | Illisible par JavaScript, jamais envoyé en HTTP ni depuis un autre site |
| 3 | **Protection CSRF** : jeton dans un cookie, renvoyé par Angular dans `X-XSRF-TOKEN` sur chaque écriture (y compris la connexion) | `SecurityConfig`, `CsrfCookieFilter` | Un site tiers ne peut pas déclencher une suppression |
| 4 | **Nouvel identifiant de session à chaque connexion** | `SessionController` | Empêche la fixation de session |
| 5 | **Anti force brute** : 5 échecs en 15 min bloquent l'adresse IP (`429`) | `LoginAttemptLimiter` | Ralentit les devinettes de mot de passe sans verrouiller le propriétaire (blocage par IP, pas par compte) |
| 6 | **Message unique « Identifiants invalides »** | `SessionController` | Ne révèle pas si l'identifiant existe |
| 7 | **Session de 30 min d'inactivité** | `application.yml` | Limite l'exposition d'un poste laissé ouvert |
| 8 | **Routes en liste blanche**, tout le reste refusé (`denyAll`) | `SecurityConfig`, `DocumentsController` | Le BFF n'est pas un proxy ouvert vers l'API |
| 9 | **Identifiants de document validés en UUID** | `DocumentsController` | Impossible d'injecter un chemin vers l'API |
| 10 | **Jeton de l'API gardé en mémoire serveur**, renouvelé une fois sur `401`, redirections HTTP désactivées | `ApiGateway`, `ApiClientConfig` | Le jeton ne sort jamais et ne suit pas une redirection |
| 11 | **Seuls le type, le nom de fichier et le corps sont relayés** ; `Cache-Control: no-store` | `DocumentsController` | Pas de fuite des en-têtes internes de l'API, pas de document en cache |
| 12 | **Erreurs filtrées** : seules 400/404/413/415 gardent leur message, le reste devient un `502`/`504` générique | `BffExceptionHandler` | Aucun détail interne vers le navigateur |
| 13 | **En-têtes** : CSP stricte (`default-src 'self'`, pas de script externe ni en ligne), HSTS, `Referrer-Policy: no-referrer`, `Permissions-Policy`, `frame-ancestors 'none'` | `SecurityConfig` | Réduit XSS, clickjacking et fuites |
| 14 | **Pas d'indexation** (`robots: noindex`) | `index.html` | Le site n'apparaît pas dans les moteurs de recherche |
| 15 | **Secrets hors du dépôt et de l'image** (`.env`, `.owner-password.txt`) | `.gitignore`, `.dockerignore` | Rien de secret versionné |
| 16 | **Conteneur non-root**, image JRE seule | `Dockerfile` | Réduit l'impact d'une compromission |
| 17 | **Taille d'upload limitée à 20 Mo** | `application.yml` | Même limite que l'API |
| 18 | **Actuator limité à `/actuator/health`**, sans détails | `application.yml` | Pas d'exposition technique |

## Risques restants

| Risque | Explication | Parade |
|---|---|---|
| Fichiers non analysés | Un PDF malveillant déposé par vous-même serait stocké tel quel et téléchargé tel quel | Ne déposer que des fichiers de confiance ; ouvrir avec un lecteur à jour |
| Une seule identité pour l'API | Tous les documents appartiennent au compte de service : le BFF est la seule barrière | Garder le compte de service secret, ne jamais l'exposer ailleurs |
| Sessions en mémoire | Un redémarrage déconnecte (conséquence acceptable en mono-utilisateur) | Aucune, volontaire |
| Anti force brute par IP, en mémoire | Remis à zéro au redémarrage ; un attaquant avec beaucoup d'adresses le contourne | Choisir un mot de passe long (≥ 16 caractères) |
| Pas d'authentification à deux facteurs | Le mot de passe est la seule protection | Évolution possible (TOTP) |

## Avant la mise en production

- [ ] Mot de passe long et unique, enregistré dans un gestionnaire ; `.owner-password.txt` supprimé.
- [ ] `BFF_COOKIE_SECURE=true` sur Render (valeur par défaut).
- [ ] Secrets saisis dans Render (variables `sync: false`), jamais dans `render.yaml`.
- [ ] `my-scan-doc-api` joignable uniquement avec le compte de service (ne pas réutiliser ce compte ailleurs).
- [ ] Tester : mauvais mot de passe 6 fois → `429` ; suppression sans être connecté → `401`.
- [ ] `.\mvnw.cmd verify` vert (tests + couverture ≥ 90 %) et `npm test` vert.

## Évolution vers plusieurs utilisateurs

À prévoir : table d'utilisateurs avec hash BCrypt, propriétaire de chaque document côté API (colonne `owner`), filtrage de toutes les requêtes par propriétaire, et jetons d'API par utilisateur plutôt qu'un compte de service partagé.

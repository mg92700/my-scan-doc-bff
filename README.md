# 🗂️ my-scan-doc-bff

Site personnel pour consulter, télécharger, archiver et supprimer ses documents scannés.

- **Front** : Angular (dossier `frontend/`), servi par le back.
- **Back (BFF, « back-for-front »)** : Spring Boot. Il garde la session du navigateur et relaie les appels vers [`my-scan-doc-api`](../my-scan-doc-api) avec un **compte de service**.

```
Navigateur ──cookie de session──▶ BFF ──jeton du compte de service──▶ my-scan-doc-api ──▶ Supabase
 (Angular)      HTTPS seulement    │ un seul utilisateur (.env)          (Postgres + Storage)
```

Le navigateur ne voit jamais le jeton de l'API, ni le compte de service, ni les clés de stockage.

## ⚙️ Configuration (`.env`)

Tout vient de `.env` (local) ou des variables d'environnement (Render). Les variables d'environnement l'emportent. Modèle : `.env.example`.

| Variable | Rôle |
|---|---|
| `BFF_USERNAME` | Identifiant de l'unique utilisateur du site |
| `BFF_PASSWORD_HASH` | **Hash BCrypt** de son mot de passe (jamais le mot de passe en clair) |
| `API_BASE_URL` | Adresse de my-scan-doc-api (`http://localhost:8080` en local) |
| `API_SERVICE_USERNAME` / `API_SERVICE_PASSWORD` | Compte de service de l'API |
| `BFF_COOKIE_SECURE` | `true` par défaut (cookie réservé à HTTPS) ; `false` en local sans HTTPS |
| `PORT` | Port d'écoute (`8080` par défaut ; `8081` en local car l'API occupe `8080`) |

L'application **refuse de démarrer** si l'utilisateur, le hash BCrypt ou le compte de service sont absents.

### Créer l'utilisateur

Choisir un mot de passe, puis calculer son hash BCrypt :

```bash
python -c "import bcrypt,getpass;print(bcrypt.hashpw(getpass.getpass().encode(),bcrypt.gensalt(10)).decode())"
```

(`pip install bcrypt` si besoin.) Copier le résultat dans `BFF_PASSWORD_HASH`. Pour changer de mot de passe : recalculer un hash et redémarrer.

> Les fichiers `.env` et `.owner-password.txt` (mot de passe initial en clair) sont ignorés par Git. Supprimer `.owner-password.txt` après l'avoir copié dans un gestionnaire de mots de passe.

## 🛠️ Lancer en local

1. Démarrer `my-scan-doc-api` (port 8080).
2. Back : `.\mvnw.cmd spring-boot:run` (port 8081 d'après `.env`).
3. Front, avec rechargement automatique :
   ```bash
   cd frontend
   npm install
   npm start        # http://localhost:4200, les appels /bff passent par un proxy vers 8081
   ```
   Ou front compilé servi par le back : `npm run build`, puis copier `frontend/dist/frontend/browser/*` dans `src/main/resources/static/` et ouvrir http://localhost:8081.

### Avec Docker (identique à Render)

```bash
docker build -t my-scan-doc-bff .
docker run --rm -p 8081:8080 --env-file .env -e BFF_COOKIE_SECURE=false -e API_BASE_URL=http://host.docker.internal:8080 my-scan-doc-bff
```

## ☁️ Déploiement sur Render (gratuit)

1. Déployer d'abord `my-scan-doc-api` et noter son adresse (`https://….onrender.com`).
2. Render → *New* → *Blueprint* → choisir ce dépôt : `render.yaml` crée le service.
3. Renseigner les variables marquées `sync: false` : `BFF_USERNAME`, `BFF_PASSWORD_HASH`, `API_BASE_URL`, `API_SERVICE_USERNAME`, `API_SERVICE_PASSWORD`.
4. Ouvrir l'adresse du service et se connecter.

L'offre gratuite endort chaque service après 15 minutes sans visite. Le premier appel après une pause peut durer **jusqu'à une minute** (le BFF se réveille, puis l'API) : le site l'indique à l'écran. Une session est perdue si le BFF redémarre (reconnexion demandée).

## 📌 Routes du BFF

Toutes exigent une session ouverte, sauf les quatre premières.

| Route | Rôle |
|---|---|
| `POST /bff/session/login` | Ouvre la session (`{username, password}`) |
| `GET /bff/session/me` | `200` si la session est valide, sinon `401` |
| `GET /bff/api-status` | `UP` ou `DOWN` selon que l'API répond (pastille en bas à droite du site ; interroger l'API la réveille) |
| `GET /actuator/health` | Santé du service |
| `POST /bff/session/logout` | Ferme la session |
| `GET /bff/documents?archived=` | Liste les documents actifs ou archivés |
| `POST /bff/documents` | Ajoute un fichier (multipart, champ `file`) |
| `GET /bff/documents/{id}/download` | Télécharge |
| `POST /bff/documents/{id}/archive` · `/unarchive` | Archive · restaure |
| `DELETE /bff/documents/{id}` | Supprime définitivement |

Seules ces routes existent (liste blanche) : le BFF n'est pas un proxy ouvert.

## 🧪 Tests

```bash
.\mvnw.cmd verify          # back : tests + couverture JaCoCo ≥ 90 % (le build échoue en dessous)
cd frontend && npm test    # front : 17 tests
```

Les tests du back simulent l'API (aucune base ni Docker nécessaire).

## 🚀 Évolution : plusieurs utilisateurs

Aujourd'hui l'unique utilisateur est dans `.env`. Pour en accepter d'autres il faudra : une table d'utilisateurs, un lien utilisateur → documents côté API (aujourd'hui tous les documents appartiennent au compte de service), et un cloisonnement des accès. Voir `SECURITY.md`.

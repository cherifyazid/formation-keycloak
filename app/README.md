# Démo Node.js — Authorization Code Flow + PKCE avec Keycloak

Petite application Express qui implémente **à la main** le flux OAuth 2.0 /
OpenID Connect **Authorization Code + PKCE** (RFC 7636), pour bien voir chaque
étape. Aucune librairie OIDC "magique" : juste `fetch`, `crypto` et `express`.

## 🧩 Le principe en 5 étapes

```
Navigateur            App Node (:3000)              Keycloak (:8080)
    |                       |                              |
    |  GET /login           |                              |
    |---------------------->| génère code_verifier         |
    |                       | code_challenge = S256(verifier)
    |   302 vers Keycloak (authorize?code_challenge=...&state=...)
    |<----------------------|                              |
    |  login (user/pass)    |                              |
    |------------------------------------------------------>|
    |   302 /callback?code=...&state=...                    |
    |<------------------------------------------------------|
    |  GET /callback?code   |                              |
    |---------------------->| POST /token                  |
    |                       | (code + code_verifier) ----->|  vérifie
    |                       |                              |  SHA256(verifier)==challenge
    |                       |<-- access_token + id_token --|
    |   page "Connecté"     |                              |
    |<----------------------|                              |
```

**Pourquoi PKCE ?** Le `code_verifier` ne quitte jamais l'app. Même si un
attaquant intercepte le `code` d'autorisation, il ne peut pas l'échanger contre
des tokens sans le `code_verifier`. C'est ce qui sécurise les **clients publics**
(SPA, mobile, et même un back-end sans secret).

## 🚀 Démarrage

### 1. Lancer Keycloak (+ Postgres + Mailpit)

Depuis la racine du repo :

```bash
docker compose up -d
```

Le realm **`pkce-demo`** est importé automatiquement
(`keycloak/realms/realm-pkce-demo.json`, grâce au flag `--import-realm`).

Console admin : http://localhost:8080 — `admin` / `admin`.

Utilisateurs de test du realm :

| username    | mot de passe | rôles          |
|-------------|--------------|----------------|
| `demo`      | `demo`       | user           |
| `admin-app` | `admin`      | user, admin    |

> ℹ️ L'import ne s'exécute que si le realm n'existe pas déjà. Après modification
> du JSON, supprimez le realm dans la console (ou recréez le conteneur) pour
> le réimporter.

### 2. Lancer l'app Node

```bash
cd app
cp .env.example .env      # ajustez si besoin
npm install
npm start                 # ou: npm run dev  (reload auto, Node >= 18)
```

Ouvrez http://localhost:3000 et cliquez sur **Se connecter avec Keycloak**.

## 🔎 Endpoints de l'app

| Route        | Rôle                                                          |
|--------------|---------------------------------------------------------------|
| `/`          | Accueil (connecté / non connecté)                             |
| `/login`     | Génère PKCE + redirige vers Keycloak (`authorization_endpoint`) |
| `/callback`  | Échange le `code` contre les tokens (`token_endpoint`)        |
| `/profile`   | Appelle `userinfo_endpoint` avec l'`access_token`             |
| `/tokens`    | Affiche les claims décodés des tokens (pédagogique)           |
| `/logout`    | Déconnexion RP-Initiated (`end_session_endpoint`)             |

## ⚙️ Le client Keycloak

Défini dans le realm `pkce-demo` :

- `clientId` : **`node-pkce-app`**
- **public** (`publicClient: true`) → pas de secret
- `pkce.code.challenge.method: S256` → **PKCE obligatoire** côté Keycloak
- redirect URI : `http://localhost:3000/callback`

### Variante client confidentiel

PKCE fonctionne aussi avec un client confidentiel (recommandé par OAuth 2.1).
Pour tester : passez le client en `publicClient: false`, ajoutez un `secret`,
puis renseignez `KC_CLIENT_SECRET` dans `.env`. Le code envoie alors
`client_secret` **en plus** du `code_verifier`.

## 🛡️ Notes sécurité (prod)

Cette démo affiche les tokens et **ne valide pas** la signature JWT (décodage
"naïf" du payload pour l'affichage). En production :

- validez la signature de l'`id_token`/`access_token` via le JWKS
  (`jwks_uri` du `.well-known`) — p.ex. avec `jose` ou `openid-client` ;
- mettez les cookies en `secure: true` derrière HTTPS ;
- changez `SESSION_SECRET` et le secret du client ;
- gérez le refresh des tokens (`refresh_token`).

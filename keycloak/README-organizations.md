# Realm `org-demo` — Organizations & redirection IdP par domaine email

Démontre la fonctionnalité **Organizations** de Keycloak 26 avec
**identity-first login** : l'utilisateur saisit son email, et Keycloak le
**redirige automatiquement vers l'IdP de son organisation** en fonction du
**domaine de l'email**.

## 🧩 Le principe

```
                          realm: org-demo  (organizationsEnabled = true)
                          ┌───────────────────────────────────────────┐
  alice@acme.com  ─────►  │ Organisation "acme"   domaine = acme.com   │ ──► IdP acme   ──► realm acme-idp
                          │   └─ IdP lié: acme  (redirect email-match) │
  john@globex.com ─────►  │ Organisation "globex" domaine = globex.com │ ──► IdP globex ──► realm globex-idp
                          │   └─ IdP lié: globex (redirect email-match)│
  bob@autre.com   ─────►  │ (aucun domaine ne correspond)              │ ──► login local (mot de passe)
                          └───────────────────────────────────────────┘
```

L'utilisateur ne voit **pas** une liste de boutons IdP : il tape juste son
email, et le domaine décide de la destination (*Home Realm Discovery*).

## 📂 Fichiers (importés automatiquement par docker-compose)

| Fichier                        | Rôle                                                        |
|--------------------------------|-------------------------------------------------------------|
| `realms/realm-org-demo.json`   | Realm principal : organisations + IdP liés + client de test |
| `realms/realm-acme-idp.json`   | Realm externe simulant l'IdP de l'entreprise **ACME**       |
| `realms/realm-globex-idp.json` | Realm externe simulant l'IdP de l'entreprise **Globex**     |
| `commandes-organizations`      | Variante kcadm.sh (mêmes étapes, à la main)                 |

> Dans la vraie vie, `acme-idp` / `globex-idp` seraient des IdP externes
> (Azure AD, Google Workspace, Okta…). Ici ce sont deux realms Keycloak du
> même serveur, pour avoir une démo **100 % autonome et testable**.

## ⚙️ Comment la redirection est configurée

Sur **chaque IdP** lié à une organisation (bloc `identityProviders` du realm) :

```jsonc
"config": {
  "kc.org.domain": "acme.com",                        // domaine déclencheur
  "kc.org.broker.redirect.mode.email-matches": "true" // redirection auto si match
}
```

Et l'organisation référence l'IdP par son alias :

```jsonc
"organizations": [
  {
    "name": "acme", "alias": "acme", "enabled": true,
    "domains": [ { "name": "acme.com", "verified": true } ],
    "identityProviders": [ { "alias": "acme" } ]
  }
]
```

> ⚠️ La fonctionnalité s'appuie sur `organizationsEnabled: true` au niveau du
> realm. Le flow `browser` reçoit alors automatiquement l'étape
> *Organization Identity-First Login*. La feature `organization` est **activée
> par défaut** depuis Keycloak 26 (aucun `--features` à ajouter).

## 🚀 Démarrer

```bash
docker compose up -d   # importe org-demo, acme-idp, globex-idp
```

Console admin : http://localhost:8080 (`admin` / `admin`).

### Utilisateurs de test

| Email             | Réside dans   | Mot de passe |
|-------------------|---------------|--------------|
| `alice@acme.com`  | realm acme-idp   | `alice` |
| `john@globex.com` | realm globex-idp | `john`  |

## ✅ Tester la redirection

**Option A — navigateur** (page de login Keycloak du realm) :

```
http://localhost:8080/realms/org-demo/account
```
Cliquez sur *Sign in*, saisissez `alice@acme.com` → vous êtes redirigé vers
l'IdP **acme** ; connectez-vous avec `alice` / `alice`.
Essayez `john@globex.com` → redirection vers **globex**.
Essayez `bob@inconnu.com` → reste sur le mot de passe local.

**Option B — avec l'app Node** du dossier `../app` (Authorization Code + PKCE) :

```bash
cd ../app
cp .env.example .env
# dans .env : KC_ISSUER=http://localhost:8080/realms/org-demo
#             KC_CLIENT_ID=org-demo-app
npm install && npm start
# http://localhost:3000 -> "Se connecter" -> saisir alice@acme.com
```

Le client public `org-demo-app` (redirect `http://localhost:3000/callback`,
PKCE S256) est déjà présent dans le realm.

## 🔎 Vérifier la config en ligne de commande

```bash
KC=formation-keycloak-keycloak-1
docker exec $KC /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 --realm master --user admin --password admin
docker exec $KC /opt/keycloak/bin/kcadm.sh get organizations -r org-demo --fields alias,domains
docker exec $KC /opt/keycloak/bin/kcadm.sh get identity-provider/instances/acme -r org-demo \
  | grep -E 'organizationId|kc.org.domain|email-matches'
```

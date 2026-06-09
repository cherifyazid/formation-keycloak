# Realm `google-idp` — connexion via Google

Realm de démo qui ajoute Google comme **Identity Provider** (bouton « Sign in with Google »).
Importé automatiquement au démarrage depuis `keycloak/realms/realm-google-idp.json`.

## 1. Créer les identifiants OAuth côté Google

1. Aller sur <https://console.cloud.google.com/apis/credentials>.
2. **Create Credentials → OAuth client ID → Web application**.
3. **Authorized redirect URIs**, ajouter l'URI de broker Keycloak :

   ```
   http://localhost:8080/realms/google-idp/protocol/openid-connect/endpoint
   ```

   > L'URI exacte est aussi affichée dans la console Keycloak :
   > *Realm `google-idp` → Identity providers → google → Redirect URI*.
4. Récupérer le **Client ID** et le **Client secret**.

## 2. Renseigner les identifiants dans Keycloak

Remplacer les valeurs `REMPLACER_PAR_...` dans
`keycloak/realms/realm-google-idp.json` (clés `clientId` / `clientSecret` du
provider `google`), **ou** les saisir directement dans la console
(*Identity providers → google*) après import.

## 3. Démarrer et tester

```bash
docker compose up -d
```

- Admin console : <http://localhost:8080/admin/> (`admin` / `admin`)
- Page de login du realm :
  <http://localhost:8080/realms/google-idp/account/>

Le bouton **Google** apparaît sur la page de login. Après authentification,
l'utilisateur Google est importé dans le realm (`syncMode: IMPORT`) avec
email / prénom / nom mappés via les `identityProviderMappers`.

## Client de test

- `google-demo-app` — client public (Authorization Code + PKCE),
  redirect URI `http://localhost:3000/callback`.
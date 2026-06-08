import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import session from 'express-session';

const {
  KC_ISSUER,
  KC_CLIENT_ID,
  KC_CLIENT_SECRET,
  REDIRECT_URI,
  POST_LOGOUT_REDIRECT_URI,
  APP_PORT = 3000,
  SESSION_SECRET = 'change-me',
} = process.env;

// ---------------------------------------------------------------------------
// Découverte des endpoints OIDC (.well-known)
// Keycloak expose toute sa configuration ; on évite ainsi de coder les URLs en dur.
// ---------------------------------------------------------------------------
const discovery = await fetch(`${KC_ISSUER}/.well-known/openid-configuration`)
  .then((r) => {
    if (!r.ok) throw new Error(`Découverte OIDC échouée (HTTP ${r.status}). Keycloak est-il démarré ?`);
    return r.json();
  })
  .catch((err) => {
    console.error('❌', err.message);
    process.exit(1);
  });

console.log('✅ Endpoints OIDC découverts pour le realm:', KC_ISSUER);

// ---------------------------------------------------------------------------
// Helpers PKCE (RFC 7636)
// ---------------------------------------------------------------------------
const base64url = (buf) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// code_verifier : chaîne aléatoire de 43–128 caractères
const generateCodeVerifier = () => base64url(crypto.randomBytes(64));

// code_challenge = BASE64URL( SHA256( code_verifier ) )  => méthode "S256"
const challengeFromVerifier = (verifier) =>
  base64url(crypto.createHash('sha256').update(verifier).digest());

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
const app = express();

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: false }, // secure:true derrière HTTPS
  })
);

const isAuthenticated = (req) => Boolean(req.session.tokens);

// ---- Accueil -------------------------------------------------------------
app.get('/', (req, res) => {
  if (!isAuthenticated(req)) {
    return res.send(`
      <h1>🔐 Démo Authorization Code + PKCE</h1>
      <p>Vous n'êtes pas connecté.</p>
      <p><a href="/login">➡️ Se connecter avec Keycloak</a></p>
    `);
  }
  const { claims } = req.session;
  res.send(`
    <h1>✅ Connecté</h1>
    <p>Bonjour <b>${claims.preferred_username}</b> (${claims.email ?? 'sans email'})</p>
    <ul>
      <li>sub : <code>${claims.sub}</code></li>
      <li>roles : <code>${(claims.realm_access?.roles || []).join(', ')}</code></li>
    </ul>
    <p><a href="/profile">👤 Voir le profil complet (UserInfo)</a></p>
    <p><a href="/tokens">🎫 Voir les tokens bruts</a></p>
    <p><a href="/logout">🚪 Se déconnecter</a></p>
  `);
});

// ---- Étape 1 : redirection vers Keycloak (authorization endpoint) --------
app.get('/login', (req, res) => {
  // 1) On génère le PKCE + un "state" et un "nonce" anti-CSRF / anti-rejeu
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = challengeFromVerifier(codeVerifier);
  const state = base64url(crypto.randomBytes(16));
  const nonce = base64url(crypto.randomBytes(16));

  // 2) On garde le verifier + state côté serveur (en session), jamais dans l'URL
  req.session.pkce = { codeVerifier, state, nonce };

  // 3) On construit l'URL d'autorisation
  const authUrl = new URL(discovery.authorization_endpoint);
  authUrl.search = new URLSearchParams({
    client_id: KC_CLIENT_ID,
    response_type: 'code',
    scope: 'openid profile email',
    redirect_uri: REDIRECT_URI,
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  }).toString();

  res.redirect(authUrl.toString());
});

// ---- Étape 2 : callback => échange du "code" contre des tokens ------------
app.get('/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    return res.status(400).send(`❌ Erreur Keycloak : ${error} — ${error_description ?? ''}`);
  }
  if (!req.session.pkce) {
    return res.status(400).send('❌ Session PKCE absente (cookie expiré ?). Recommencez la connexion.');
  }
  // Vérification du "state" pour se prémunir du CSRF
  if (state !== req.session.pkce.state) {
    return res.status(400).send('❌ State invalide — requête potentiellement falsifiée.');
  }

  // Échange code -> tokens (token endpoint). On renvoie le code_verifier :
  // Keycloak vérifie que SHA256(code_verifier) == code_challenge envoyé à l'étape 1.
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: KC_CLIENT_ID,
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: req.session.pkce.codeVerifier,
  });
  if (KC_CLIENT_SECRET) body.set('client_secret', KC_CLIENT_SECRET); // si client confidentiel

  const tokenRes = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!tokenRes.ok) {
    const detail = await tokenRes.text();
    return res.status(400).send(`❌ Échange du code échoué (HTTP ${tokenRes.status}) : ${detail}`);
  }

  const tokens = await tokenRes.json();

  // Décodage (NON vérifié cryptographiquement ici) du payload de l'ID token
  // pour afficher les claims. En prod, valider la signature via les JWKS.
  const claims = decodeJwtPayload(tokens.id_token);

  // Anti-rejeu : le nonce de l'ID token doit correspondre à celui envoyé
  if (claims.nonce && claims.nonce !== req.session.pkce.nonce) {
    return res.status(400).send('❌ Nonce invalide — ID token potentiellement rejoué.');
  }

  // On stocke les tokens en session et on nettoie le PKCE
  req.session.tokens = tokens;
  req.session.claims = claims;
  delete req.session.pkce;

  res.redirect('/');
});

// ---- Profil via UserInfo endpoint ----------------------------------------
app.get('/profile', async (req, res) => {
  if (!isAuthenticated(req)) return res.redirect('/login');

  const infoRes = await fetch(discovery.userinfo_endpoint, {
    headers: { Authorization: `Bearer ${req.session.tokens.access_token}` },
  });
  const info = await infoRes.json();
  res.type('html').send(`
    <h1>👤 UserInfo</h1>
    <pre>${JSON.stringify(info, null, 2)}</pre>
    <p><a href="/">⬅️ Retour</a></p>
  `);
});

// ---- Affichage des tokens bruts (pédagogique) ----------------------------
app.get('/tokens', (req, res) => {
  if (!isAuthenticated(req)) return res.redirect('/login');
  res.type('html').send(`
    <h1>🎫 Tokens</h1>
    <h3>ID token (claims décodés)</h3>
    <pre>${JSON.stringify(req.session.claims, null, 2)}</pre>
    <h3>Access token (claims décodés)</h3>
    <pre>${JSON.stringify(decodeJwtPayload(req.session.tokens.access_token), null, 2)}</pre>
    <p><a href="/">⬅️ Retour</a></p>
  `);
});

// ---- Déconnexion (RP-Initiated Logout) -----------------------------------
app.get('/logout', (req, res) => {
  const idToken = req.session.tokens?.id_token;
  req.session.destroy(() => {
    const logoutUrl = new URL(discovery.end_session_endpoint);
    logoutUrl.search = new URLSearchParams({
      client_id: KC_CLIENT_ID,
      post_logout_redirect_uri: POST_LOGOUT_REDIRECT_URI,
      ...(idToken ? { id_token_hint: idToken } : {}),
    }).toString();
    res.redirect(logoutUrl.toString());
  });
});

// ---------------------------------------------------------------------------
function decodeJwtPayload(jwt) {
  if (!jwt) return null;
  try {
    const payload = jwt.split('.')[1];
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return { error: 'JWT illisible' };
  }
}

app.listen(APP_PORT, () => {
  console.log(`🚀 App démarrée sur http://localhost:${APP_PORT}`);
});

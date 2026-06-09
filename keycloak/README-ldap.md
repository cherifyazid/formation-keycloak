# Intégration LDAP (OpenLDAP + Keycloak)

Ajoute un annuaire OpenLDAP fédéré dans Keycloak via le realm **`ldap-demo`**.

## Démarrage

Lancer les deux fichiers compose ensemble (le `-f` les fusionne) :

```bash
docker compose -f docker-compose.yml -f docker-compose.ldap.yml up -d
```

| Service       | URL / Port                              | Identifiants                                |
|---------------|-----------------------------------------|---------------------------------------------|
| Keycloak      | http://localhost:8080                   | admin / admin                               |
| OpenLDAP      | ldap://localhost:389                    | cn=admin,dc=example,dc=org / admin          |
| phpLDAPadmin  | http://localhost:6443                   | cn=admin,dc=example,dc=org / admin          |

## Annuaire injecté au démarrage

Le fichier `keycloak/ldap/bootstrap.ldif` crée la structure et les comptes
(base **`dc=example,dc=org`**) au premier lancement :

```
dc=example,dc=org
├── ou=people
│   ├── uid=jdoe    (John Doe   / jdoe123)    -> groups: developers
│   ├── uid=asmith  (Alice Smith/ asmith123)  -> groups: developers, managers
│   └── uid=bwayne  (Bruce Wayne/ bwayne123)  -> groups: admins
└── ou=groups
    ├── cn=developers
    ├── cn=managers
    └── cn=admins
```

> Mots de passe en clair (démo). Keycloak les valide par **bind LDAP**.

## Fédération & mapping des champs

Le realm `ldap-demo` (`keycloak/realms/realm-ldap-demo.json`) déclare un
*User Federation provider* `ldap` pointant sur `ldap://openldap:389`
(nom de service interne au réseau Docker), en mode **READ_ONLY** avec import.

Mappers d'attributs LDAP → modèle utilisateur Keycloak :

| Attribut LDAP      | Attribut Keycloak | Mapper                     |
|--------------------|-------------------|----------------------------|
| `uid`              | username          | user-attribute-ldap-mapper |
| `givenName`        | firstName         | user-attribute-ldap-mapper |
| `sn`               | lastName          | user-attribute-ldap-mapper |
| `mail`             | email             | user-attribute-ldap-mapper |
| `telephoneNumber`  | phoneNumber       | user-attribute-ldap-mapper |
| `title`            | jobTitle          | user-attribute-ldap-mapper |
| `member` (groupes) | groups            | group-ldap-mapper          |

## Vérifier

1. Console admin → realm **ldap-demo** → *User federation* → `ldap-openldap`
   → **Test connection** / **Test authentication**, puis **Sync all users**.
2. *Users* → les comptes LDAP apparaissent (importés).
3. Tester un login direct grant :

```bash
curl -s -X POST http://localhost:8080/realms/ldap-demo/protocol/openid-connect/token \
  -d grant_type=password -d client_id=ldap-spa \
  -d username=jdoe -d password=jdoe123 | jq .access_token
```

## Inspecter l'annuaire en CLI

```bash
docker exec openldap ldapsearch -x -H ldap://localhost \
  -b "dc=example,dc=org" -D "cn=admin,dc=example,dc=org" -w admin
```

## Réinitialiser l'annuaire

Le LDIF n'est rejoué qu'au **premier** démarrage. Pour repartir de zéro :

```bash
docker compose -f docker-compose.yml -f docker-compose.ldap.yml down
docker volume rm formation-keycloak_ldap_data formation-keycloak_ldap_config
```
#!/bin/sh
# Vérifie que le realm org-demo a bien câblé la liaison Organisation <-> IdP
# et que la redirection par domaine email fonctionne.
#
# Usage:  sh keycloak/verify_org.sh
#
KC="${KC_CONTAINER:-formation-keycloak-keycloak-1}"
RUN="docker exec $KC /opt/keycloak/bin/kcadm.sh"

$RUN config credentials --server http://localhost:8080 \
  --realm master --user admin --password admin >/dev/null 2>&1

echo "=== IdP 'acme' dans org-demo (organizationId + config org) ==="
$RUN get identity-provider/instances/acme -r org-demo \
  | grep -E "organizationId|domain|email-matches"

echo
echo "=== Organisations du realm org-demo ==="
$RUN get organizations -r org-demo --fields alias,domains

echo
echo "Pour tester la redirection complète, ouvre dans un navigateur :"
echo "  http://localhost:8080/realms/org-demo/account"
echo "  -> saisis alice@acme.com   => redirigé vers l'IdP ACME"
echo "  -> saisis john@globex.com  => redirigé vers l'IdP Globex"
echo "  -> saisis x@inconnu.com    => reste sur le mot de passe local"

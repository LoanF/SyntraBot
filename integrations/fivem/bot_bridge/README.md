# bot_bridge — pont FiveM ↔ Syntra

Ressource serveur (JS, aucun client script). Elle :

- envoie les **reports** avec contexte (position, vie/armure, arme, véhicule, joueurs ≤ 50 m, UID syntra-admin) ;
- **lie** le compte Discord aux identifiants FiveM à chaque connexion (`license2`/`license`) → alimente la fiche joueur et la téléportation ;
- reçoit par long-polling l'ordre **« Téléporter sur le joueur »** (même *routing bucket* que la cible, pour ne pas arriver dans une instance différente).

Le bridge **appelle l'API en sortant** : aucun port à ouvrir. Toutes les requêtes sont signées HMAC-SHA256 (timestamp + nonce), et les réponses du poll sont vérifiées (impossible d'usurper l'API pour téléporter un staff).

## Installation

1. Dans le dashboard : créer une clé API avec les scopes `bridge:report` (création + événements), `bridge:poll`, `bridge:link`.
2. Copier le dossier dans `resources/`, puis dans `server.cfg` :

```cfg
set syntra_bridge:url    "https://api.votre-domaine.fr"
set syntra_bridge:keyId  "sk_xxxxxxxx"
set syntra_bridge:secret "xxxxxxxxxxxxxxxx"   # à ne pas versionner
set syntra_bridge:radius 50
ensure bot_bridge
```

Convars optionnels : `syntra_bridge:radius` (50 m), `syntra_bridge:debug` (0/1).

## Reports (≠ tickets)

Les reports sont créés **uniquement en jeu** (panel de `syntra-admin`). Le bridge en fait un miroir dans Discord : un message + un **fil** dans le salon staff, avec boutons Prendre en charge / Téléporter / Clôturer. Les messages du joueur (panel en jeu) apparaissent dans le fil ; ce que le staff écrit dans le fil est relayé dans le panel en jeu. Aucun report ne se crée depuis Discord.

Il faut appliquer le petit patch décrit dans [`../syntra-admin-reports.patch.md`](../syntra-admin-reports.patch.md) (événements + export `ReportFromDiscord`). Sans ce patch, le bridge reste inerte pour les reports.

On ne définit **pas** de commande `/report` supplémentaire.

## Fiche joueur (mapping `syntra-custom`)

Dans le dashboard, choisir le preset **Qbox + Syntra** : `players` (qbx_core), `bans` (qbx_core, `expire`) et `syntra_sanctions` (`kind='warn'`, `revoked=0`) pour les avertissements. Créer un compte MySQL **en lecture seule** (`GRANT SELECT`) : le test de connexion refuse un compte avec droits d'écriture.

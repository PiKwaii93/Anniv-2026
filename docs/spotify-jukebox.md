# Spotify dans la régie

La régie `/admin/party-extras#spotify` pilote Spotify sur un appareil explicitement sélectionné. Le PC garde la lecture ; la régie peut être ouverte sur un téléphone. Les invités n'ont pas à connecter Spotify.

## Première connexion

1. Avec le compte Spotify Premium qui diffusera la musique, créer une application sur https://developer.spotify.com/dashboard et sélectionner Web API.
2. Site : `https://anniv-2026-pi.vercel.app`.
3. Redirect URI exacte : `https://anniv-2026-pi.vercel.app/admin/spotify/callback`.
4. Copier le Client ID dans la régie, enregistrer et cliquer sur Connecter Spotify. Aucun Client Secret n'est nécessaire (Authorization Code + PKCE).
5. Ouvrir Spotify sur le PC, lancer un premier morceau, actualiser les appareils dans la régie et sélectionner le PC.

Les boutons Lecture/Pause/Suivant visent toujours cet appareil. Les invités saisissent un titre et, s’ils le connaissent, l’artiste. Aucun lien ni compte Spotify invité n’est requis.

Sur `/jukebox`, l’invité clique sur « Rechercher mon morceau », choisit parmi les résultats (titre, artistes, album, durée), puis « Choisir et ajouter à la file Spotify ». Son choix est ajouté sans acceptation ni recherche de la régie. Aucun résultat : seul l’invité précise la recherche, aucune proposition n’est créée. Le compte Spotify déjà connecté sert à la recherche ; aucun compte invité ni lien à copier.

La proposition n’est publiée qu’après confirmation de l’ajout à la file. Les anciennes propositions en attente peuvent être précisées par leur auteur, même s’il a utilisé ses trois propositions. La régie n’affiche plus de formulaire de recherche ni de choix d’artiste ; elle conserve le refus et les commandes de dépannage sur les morceaux identifiés. L’ordre envoyé est celui de Spotify, les votes ne le réordonnent pas. Les statuts « Marquer » restent manuels et distincts de la lecture réelle.

Un envoi incertain n'est pas répété automatiquement. L'organisateur vérifie la file sur le PC et déclare le titre présent ou absent. Un titre déjà envoyé est protégé contre les doublons et le refus tardif dans la régie. Le retirer de la file se fait dans Spotify. Déconnecter du site supprime les autorisations stockées et la sélection de l'appareil ; cela n'arrête pas la musique déjà en cours dans Spotify.

## Sécurité et déploiement

- Edge Function `spotify-jukebox`, `verify_jwt=true`. Les actions admin vérifient `auth.getUser` et `app_admins`. Les deux actions invité `guest_search`/`guest_send` vérifient séparément la session privée `party_identity_sessions` ; elles ne passent jamais par une identité admin.
- RPC `spotify_guest_bridge` exécutable uniquement par `service_role` : contrôle de l’identité, propriété de la proposition, ouverture du jukebox, quota de trois propositions, limite de vingt requêtes par minute et invité. Aucun appareil choisi par l’invité n’est accepté. Métadonnées canoniques relues chez Spotify avant tout envoi.
- Un UUID de proposition stable rend les nouvelles tentatives idempotentes. Le bail est partagé avec les commandes admin. Les confirmations incertaines ne sont jamais renvoyées automatiquement. Les recherches ne créent pas de propositions.
- RPC `spotify_bridge` exécutable uniquement par `service_role`. Schéma privé avec RLS sans lecture directe pour les clients (les deux avis INFO no-policy sont intentionnels).
- Jetons Spotify chiffrés dans Supabase Vault. Le navigateur ne reçoit ni access token, ni refresh token, ni vérificateur PKCE. État OAuth à usage unique, lié à l'admin, valable dix minutes, callback fixe.
- Bail de 75 secondes pour sérialiser les commandes inter-appareils. Délai réseau de dix secondes. Les envois incertains sont enregistrés avant la requête Spotify.
- Migration puis Edge Function à déployer avant le frontend. Aucun secret Spotify à ajouter aux variables Vite/Vercel.

## Vérification

`node --test tests/*.test.mjs`, `node tests/party-extras-render.mjs`, `npm run build`.
`tests/spotify-bridge.sql` vérifie droits, OAuth, Vault et doublons dans une transaction annulée. `tests/spotify-guest.sql` (à exécuter entre BEGIN/ROLLBACK) vérifie isolation, droits service-only, ancien titre à quota plein, acceptation automatique, fermeture et limitation des recherches. Tests réseau avec réponses Spotify simulées ; le test d’écoute réel reste à faire avec le propriétaire.

Sources : [PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow), [file de lecture](https://developer.spotify.com/documentation/web-api/reference/add-to-queue), [redirect URI](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri), [Vault](https://supabase.com/docs/guides/database/vault).

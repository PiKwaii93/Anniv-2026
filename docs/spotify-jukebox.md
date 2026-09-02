# Spotify dans la régie

La régie `/admin/party-extras#spotify` pilote Spotify sur un appareil explicitement sélectionné. Le PC garde la lecture ; la régie peut être ouverte sur un téléphone. Les invités n'ont pas à connecter Spotify.

## Première connexion

1. Avec le compte Spotify Premium qui diffusera la musique, créer une application sur https://developer.spotify.com/dashboard et sélectionner Web API.
2. Site : `https://anniv-2026-pi.vercel.app`.
3. Redirect URI exacte : `https://anniv-2026-pi.vercel.app/admin/spotify/callback`.
4. Copier le Client ID dans la régie, enregistrer et cliquer sur Connecter Spotify. Aucun Client Secret n'est nécessaire (Authorization Code + PKCE).
5. Ouvrir Spotify sur le PC, lancer un premier morceau, actualiser les appareils dans la régie et sélectionner le PC.

Les boutons Lecture/Pause/Suivant visent toujours cet appareil. Les invités saisissent un titre et, s’ils le connaissent, l’artiste. Aucun lien ni compte Spotify invité n’est requis.

Depuis la régie sur téléphone, « Accepter et envoyer sur le PC » recherche le morceau sur Spotify. Une correspondance exacte et unique est envoyée directement. Sinon, jusqu’à cinq résultats (titre, artistes, album, durée) sont proposés : rien n’est envoyé avant le choix de l’organisateur. La recherche peut être précisée sur place. Aucun résultat n’est une invitation à préciser le texte, pas à chercher un lien sur le PC. La recherche utilise le compte Spotify déjà connecté, sans nouvelle autorisation ni secret.

La proposition n’est publiée qu’après confirmation de l’ajout à la file. « Accepter sans envoyer » conserve la modération/vote séparée. L’ordre déjà envoyé est celui de Spotify. Les statuts manuels « Marquer » du site restent distincts de la lecture Spotify réelle affichée en haut de la régie. Les anciens liens vers un titre Spotify restent reconnus ; les liens vers d’autres services sont remplacés par la recherche titre/artiste.

Un envoi incertain n'est pas répété automatiquement. L'organisateur vérifie la file sur le PC et déclare le titre présent ou absent. Un titre déjà envoyé est protégé contre les doublons et le refus tardif dans la régie. Le retirer de la file se fait dans Spotify. Déconnecter du site supprime les autorisations stockées et la sélection de l'appareil ; cela n'arrête pas la musique déjà en cours dans Spotify.

## Sécurité et déploiement

- Edge Function `spotify-jukebox`, `verify_jwt=true`, validation du JWT avec `auth.getUser`, puis contrôle d'appartenance à `app_admins`.
- RPC `spotify_bridge` exécutable uniquement par `service_role`. Schéma privé avec RLS sans lecture directe pour les clients (les deux avis INFO no-policy sont intentionnels).
- Jetons Spotify chiffrés dans Supabase Vault. Le navigateur ne reçoit ni access token, ni refresh token, ni vérificateur PKCE. État OAuth à usage unique, lié à l'admin, valable dix minutes, callback fixe.
- Bail de 75 secondes pour sérialiser les commandes inter-appareils. Délai réseau de dix secondes. Les envois incertains sont enregistrés avant la requête Spotify.
- Migration puis Edge Function à déployer avant le frontend. Aucun secret Spotify à ajouter aux variables Vite/Vercel.

## Vérification

`node --test tests/*.test.mjs`, `node tests/party-extras-render.mjs`, `npm run build`.
`tests/spotify-bridge.sql` vérifie droits, OAuth, Vault et doublons dans une transaction annulée. Tests réseau avec réponses Spotify simulées ; la lecture réelle nécessite l'autorisation du compte du propriétaire.

Sources : [PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow), [file de lecture](https://developer.spotify.com/documentation/web-api/reference/add-to-queue), [redirect URI](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri), [Vault](https://supabase.com/docs/guides/database/vault).

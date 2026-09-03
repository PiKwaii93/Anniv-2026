# La soirée — salon commun

- Invités : `/chat`, accès depuis l’accueil, identité déjà enregistrée.
- Régie : `/admin/chat`, accès depuis le panneau Régie et les raccourcis du Directeur.
- Une discussion pour tous les invités identifiés, sans salons privés, pièces jointes, invitations ou notifications push. Aucun lien avec la diffusion TV ou les annonces officielles.
- Texte brut de 1 à 300 caractères Unicode, prénom validé côté serveur, date et heure.
- Suppression confirmée de ses propres messages ; l’administrateur peut supprimer tout message et suspendre/reprendre les envois. Une suppression efface le texte stocké, pas les métadonnées nécessaires à l’anti-spam.
- Ouvert indépendamment de la phase de la soirée ; la pause manuelle conserve la lecture.

## Synchronisation et erreurs

Le salon vérifie les changements toutes les 3 secondes lorsqu’il est visible ; l’accueil ne lit que le compteur toutes les 20 secondes. Le retour au premier plan et le retour réseau déclenchent une lecture, jamais un renvoi automatique. Pas de publication Realtime des lignes privées.

Une page contient au plus 50 messages, avec historique par curseur. La lecture d’une ancienne page ne marque pas les nouveaux messages comme lus. Les marqueurs de lecture sont associés à l’identité, monotones et stockés côté serveur ; les propres messages et messages supprimés ne comptent pas comme non lus. Le défilement suit les nouveaux messages uniquement si le lecteur est déjà en bas.

Les actions ont un délai réseau maximal de 12 secondes. Un échec conserve le texte tant que cette page reste ouverte. Réessayer le même texte réutilise l’identifiant de requête de cet envoi, même si la réponse initiale s’est perdue. Changer d’identité efface les données affichées et le brouillon. Aucun stockage local persistant du texte.

## Sécurité

Migration `20260903193803_party_guest_chat.sql` : tables dans le schéma non exposé `party_chat`, RLS activée et aucun droit direct pour `anon`/`authenticated`. Les RPC publiques sont `SECURITY INVOKER` ; leurs implémentations privées utilisent un `search_path` vide et vérifient chaque accès.

Les invités sont validés avec la paire `player_key`/`session_token` via la fonction existante `party_extras.identity_name`. Les opérations de modération contrôlent `auth.uid()` dans `public.app_admins` ; ni le prénom ni un booléen envoyé par le client ne donnent de droits. Aucun token, identifiant de session ou clé de joueur n’est retourné dans les messages.

Un verrou bref sur la configuration sérialise les envois avec la pause et rend les quotas atomiques : un envoi toutes les 3 secondes, au plus 10 par minute et par identité. Supprimer un message ne réinitialise pas ces quotas. Une contrainte unique `(player_key, request_id)` garantit l’idempotence.

Les trois informations `RLS Enabled No Policy` de l’analyseur sont attendues : les tables sont volontairement interdites en accès direct. Aucune nouvelle alerte WARN/ERROR après la migration ; les alertes préexistantes hors chat n’ont pas été modifiées.

## Vérification

- `node --test tests/*.test.mjs` : 155 tests, dont 14 nouveaux scénarios du salon.
- `npm run build` et lint ciblé du chat : succès.
- `tests/party-chat.sql` : identités fictives, authentification, modération, pagination, Unicode, quotas, idempotence et non-lus ; transaction entièrement annulée. Exécuté avant et après déploiement de la migration. Ne crée aucun message durable.
- `node tests/chat-preview.mjs` : aperçu visuel local isolé, composants réels et données fictives ; aucune connexion Supabase. L’accès à localhost est bloqué dans le navigateur distant de vérification, donc aucun test visuel sur téléphone réel n’est revendiqué.

Avant la soirée, valider avec deux vrais téléphones : ouvrir Accueil → La soirée, envoyer un message, voir sa réception sans rechargement, vérifier le compteur au retour sur l’accueil, puis la suppression et la pause depuis la régie.

# Déconnecter les invités

Dans `/admin/guests`, le bloc **Libérer les identités** contient **Déconnecter tous les invités**, puis une confirmation distincte. Le Directeur contient aussi un raccourci vers ce bloc.

La mise en ligne n'exécute pas la déconnexion. Les comptes Supabase Auth des administrateurs ne sont pas touchés. Le profil invité éventuellement utilisé sur le même navigateur sera, lui, déconnecté.

## Comportement

- L'action libère toutes les identités globales et invalide les jetons des joueurs La Salle et Missions, sans supprimer leurs lignes ni leurs scores.
- Les anciens jetons sont révoqués définitivement dans un schéma privé. Un onglet oublié ne peut pas réacquérir automatiquement son ancien prénom.
- Les fonctions historiques de connexion sont conservées derrière des copies privées, inaccessibles aux rôles clients. Les points d'entrée publics vérifient la révocation avant d'appeler leur logique existante.
- Connexions et déconnexion globale partagent un verrou transactionnel : une connexion ne peut pas réintroduire un ancien jeton pendant le reset.
- Les pages invitées de cette version vérifient leur session toutes les 10 secondes lorsqu'elles sont visibles, et au retour dans l'onglet ou du réseau. Pas de reload. Une panne réseau ne supprime pas l'identité locale.
- Les anciens onglets qui n'ont pas encore chargé cette version sont refusés côté serveur mais peuvent devoir être rechargés une fois pour afficher le nouveau parcours.
- Les données restent rattachées à la personne. Après avoir choisi à nouveau son prénom, elle retrouve ses contenus et sa progression côté serveur. Les données uniquement locales restent liées à l'appareil.

## Autorisation et tests

`admin_disconnect_party_guests(p_confirm boolean)` exige le rôle authentifié ET une ligne `app_admins` correspondant à `auth.uid()`. Une simple identité invitée n'autorise pas cette action. Le paramètre de confirmation doit être `true`.

`party_identity_is_valid` est une lecture sans attribution de mission ni réclamation d'identité.

`node --test tests/guest-sessions.test.mjs` teste le vrai composant admin et le provider d'identité avec des services en mémoire. `tests/guest-sessions.sql` vérifie les permissions, la révocation, la reconnexion et l'égalité de tous les contenus des schémas applicatifs avant/après déconnexion (hors seuls jetons), dans une transaction entièrement annulée. Ne jamais retirer son `ROLLBACK`.

Test manuel conseillé hors jeu en cours : deux téléphones identifiés → confirmation admin → retour au choix du prénom sous 10 secondes → reconnexion et vérification des contenus. Ne pas cliquer sur ce bouton en pleine partie sans prévenir les invités.

## Protection des mises à jour via l’API

PostgREST charge `safeupdate` pour les connexions API. Les deux mises à jour de jetons et la suppression des sessions globales ciblent explicitement les jetons déjà inscrits dans `party_identity.revoked_tokens`. Aucune protection n’est désactivée.

Le test SQL direct ne suffit pas à reproduire cette protection. Sur une base de test où le chargement est autorisé, lancer `psql -X -v ON_ERROR_STOP=1 -f tests/guest-sessions-safeupdate.sql` : ce lanceur vérifie d’abord qu’un UPDATE non filtré est réellement refusé, puis exécute les tests transactionnels existants. Si l’hébergement interdit `LOAD`, ne pas modifier les permissions : valider le vrai bouton via l’API avec une session admin, uniquement après autorisation explicite de la déconnexion réelle.

L’interface distingue un refus serveur (avec son code), une session admin invalide et un problème de transport au résultat incertain. Elle ne révèle pas le message SQL brut et ne répète jamais automatiquement la déconnexion.

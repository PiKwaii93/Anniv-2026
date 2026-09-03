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

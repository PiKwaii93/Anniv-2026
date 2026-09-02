# Anniv 2026 — quatre ajouts

Anniversaire : 24 octobre 2026 à 21 h 30, Europe/Paris.

1. Capsule temporelle : une lettre modifiable par identité (message, souvenir, prédiction), privée. Ouverture par défaut le 25 octobre 2026 à midi à Paris ; la régie peut choisir le 24 octobre 2027 à midi. Seul le nombre de lettres est accessible à la régie avant l'ouverture. Export après ouverture.
2. Jukebox : trois propositions par identité, titre/artiste et lien d'écoute facultatif. Modération avant affichage collectif, un vote par invité et morceau. Régie : accepter/refuser, lancer un titre, marquer joué et exporter la sélection. Lecture audio par l'organisateur depuis les liens.
3. Duos : participation volontaire pendant la phase live. File d'attente et appariement atomique, défis sans obligation d'alcool ni contact physique. Confirmation des deux partenaires, annulation possible, trois attributions maximum, pas de partenaire répété.
4. Générique : automatique en fin de soirée si activé, prénoms, photos publiées et récompenses, pause/suivant et retour au Hall of Fame. Relance depuis la régie. Aucun message privé sur la TV.

Trois routes invitées, cartes sur l'accueil et une régie commune accessible depuis le Directeur et le tableau de bord. Paramètres d'ouverture et visibilité indépendants. Stockage isolé et RPC contrôlées avec l'identité existante. Tests SQL transactionnels sans données persistantes, tests métier, build et lint avant préproduction et production.

Vérification : `node --test tests/*.test.mjs`, `node tests/party-extras-render.mjs`, `npm run build`. Le script de rendu remplace les hooks par des données en mémoire et ne contacte pas Supabase. `EXTRAS_REVIEW_PATH=/tmp/extras-review.html node tests/party-extras-render.mjs` produit une vue des pages à 390 px. Le test SQL s'exécute dans une transaction suivie de ROLLBACK.

Les tables privées ont RLS activé sans politique autorisant la lecture directe, et aucun privilège client sur les tables. Le signal informatif Supabase « RLS Enabled No Policy » est donc attendu. Les fonctions publiques sont des wrappers invoker ; les fonctions internes contrôlent les sessions invitées ou l'identité admin avant toute opération.

with new_questions(
  prompt,
  answer_a,
  answer_b,
  answer_c,
  answer_d,
  correct_index,
  reveal_note,
  timer_seconds,
  item_order
) as (
  values
    (
      'Quel sport Maxence pratique-t-il en club ? 🤾',
      'Football', 'Handball', 'Basketball', 'Volleyball', 2,
      'Entre les entraînements, les matchs et les troisièmes mi-temps, difficile de passer à côté ! 🍻',
      15, 1
    ),
    (
      'Quel animal est clairement supérieur à tous les autres selon Maxence ? 🐱',
      'Le chien', 'Le lapin', 'Le chat', 'Le pingouin', 3,
      'Miaou miaou. Aucun débat possible, les chats dominent le monde. 🐈',
      15, 2
    ),
    (
      'Quel est le nom de la personnalité secrète de Maxence ? 💅',
      'Maxinator', 'Maxounette', 'Maxichou', 'Maximus', 2,
      'Derrière Maxence se cache une véritable diva. Et elle ne demande qu''à sortir. 💋',
      15, 3
    ),
    (
      'Dans quel pays Maxence a-t-il vécu son légendaire Korea Arc ? ✈️',
      'Japon', 'Chine', 'Corée du Sud', 'Thaïlande', 3,
      'L''un des meilleurs arcs narratifs de sa vie. Les scénaristes se sont surpassés. 🇰🇷',
      15, 4
    ),
    (
      'Quel plat Maxence préparait-il autrefois à presque toutes ses soirées ? 🥞',
      'Des gaufres', 'Des crêpes', 'Des burgers', 'Des pizzas', 2,
      'Avant d''être organisateur de soirées, Maxence était surtout crêpier à domicile. Le grand retour du chef reste attendu.',
      15, 5
    ),
    (
      'Quel mois est celui de l''anniversaire de Maxence ? 🎂',
      'Septembre', 'Novembre', 'Octobre', 'Décembre', 3,
      'Si vous vous trompez à cette question alors que vous êtes à son anniversaire, il va falloir sérieusement revoir notre amitié. 💀',
      15, 6
    ),
    (
      'Quel surnom évoque les performances acoustiques nocturnes de Maxence ? 🦖',
      'Snorezilla', 'Ronflex 3000', 'Dark Vador', 'Le tracteur', 1,
      'Des accusations totalement infondées. Personnellement, il dort très bien. 😴',
      15, 7
    ),
    (
      'Quel jeu est devenu une discipline presque officielle des soirées de Maxence ? 🏓',
      'Le poker', 'Le Monopoly', 'Le beer pong', 'Le Uno', 3,
      'Des années d''entraînement pour lancer une balle de ping-pong dans un gobelet. Le sport de haut niveau.',
      15, 8
    ),

    (
      'Combien de dates a-t-il fallu à Maxence pour oser prendre la main de Paloma ? 🥹❤️',
      '1 date', '3 dates', '5 dates', '8 dates', 3,
      'Cinq rendez-vous, une préparation psychologique digne des forces spéciales et enfin… un contact entre deux mains. Oui, il est shy.',
      30, 9
    ),
    (
      'Combien de temps Maxence pouvait-il passer dans la salle de bain avant une soirée ? 🪞',
      '30 minutes', '1 heure', '2 heures', '4 heures', 3,
      'Les invités étaient parfois déjà arrivés que la star était encore en préparation. Même Beyoncé fait plus vite.',
      30, 10
    ),
    (
      'Comment s''appelait le chat adoré de Maxence ? 🐈❤️',
      'Simba', 'Horus', 'Salem', 'Osiris', 2,
      'Notre petit roi, parti trop tôt, mais toujours présent dans nos souvenirs. ❤️',
      30, 11
    ),
    (
      'Sur quelle application a-t-on découvert le mystérieux sosie de Maxence ? 👥',
      'Tinder', 'Snapchat', 'Fruitz', 'Instagram', 3,
      'Son double habite à seulement 3 km. Même les applications de rencontre se mettent à faire du clonage.',
      30, 12
    ),
    (
      'Qui a volé les photos du séjour spa de Maxence pour faire croire qu''il y était allé ? 📸',
      'Adam', 'Alex', 'Matthis', 'Talvyn', 3,
      'Zéro réservation, zéro déplacement, mais de magnifiques stories Instagram. Tout pour les caméras.',
      30, 13
    ),
    (
      'Quelle était la brillante idée de startup de Maxence, baptisée Blink ? 👁️💸',
      'Un réseau social pour chats', 'Du contenu payant qui disparaît après visionnage', 'Une application de rencontres', 'Une IA pour faire ses devoirs', 2,
      'OnlyFans rencontre Snapchat. Rémi avait quelques inquiétudes sur les éventuelles conséquences judiciaires. 💀',
      30, 14
    ),
    (
      'Quel produit Maxence a-t-il accidentellement emporté pour soigner sa gorge en vacances ? 🍯',
      'Du miel aphrodisiaque', 'Du sirop pour enfants', 'Une huile essentielle', 'Du piment liquide', 1,
      'L''objectif était de soigner sa gorge, pas de réveiller ses instincts primitifs.',
      30, 15
    ),
    (
      'Dans quel domaine professionnel travaille Maxence ? 💻',
      'Le droit', 'La finance', 'La tech et la data', 'La médecine', 3,
      'Quand il ne prépare pas des soirées, il passe ses journées à expliquer à des ordinateurs comment faire leur travail.',
      30, 16
    ),

    (
      'Dans quelle école Maxence a-t-il étudié le développement web ? 🎓',
      'EPITA', 'HETIC', 'École 42', 'Epitech', 2,
      'Plusieurs années d''études pour finir par développer une application permettant à ses potes de se mettre des dossiers. Un investissement remarquable.',
      30, 17
    ),
    (
      'Quelle spécialité Maxence avait-il choisie pour son bac scientifique ? 📐',
      'Physique-chimie', 'SVT', 'Mathématiques', 'Informatique', 3,
      'Des années de maths pour finalement calculer combien de bières il faut prévoir pour 45 invités.',
      30, 18
    ),
    (
      'Dans quelle structure Maxence a-t-il travaillé pendant près de quatre ans ? 🏛️',
      'La SNCF', 'Des ministères français', 'Une banque', 'Disneyland Paris', 2,
      'La République l''a formé pendant près de quatre ans. On vous laisse juger du résultat.',
      30, 19
    ),
    (
      'Quel type de permis de conduire Maxence a-t-il obtenu en 2026 ? 🚗',
      'Boîte manuelle', 'Boîte automatique', 'Permis moto', 'Aucun, il ne l''a pas encore', 2,
      'Un nouveau conducteur sur les routes. Les dos-d''âne n''ont qu''à bien se tenir.',
      30, 20
    ),
    (
      'Combien de générations de tables avons-nous connues à la maison ? 🪑',
      'Une', 'Deux', 'Trois', 'Cinq', 3,
      'Table V1, V2, V3… Plus de renouvellement que certaines franchises de jeux vidéo.',
      30, 21
    ),
    (
      'Quel mot Maxence voulait-il prononcer lors de son célèbre lapsus de raclette ? 😬',
      'Shabbat', 'Shazam', 'Shalom', 'Sabbatical', 1,
      'Une simple conversation sur une tradition religieuse qui a soudainement pris un tournant historique extrêmement malheureux.',
      30, 22
    ),
    (
      'Quels étaient les prénoms de nos deux expériences aérodynamiques autoroutières ? 🎈',
      'Valérie et Véronique', 'Nathalie et Nicole', 'Monique et Martine', 'Chantal et Chloé', 1,
      'Deux préservatifs, une autoroute et des ambitions scientifiques absolument démesurées. La NASA n''a toujours pas répondu.',
      30, 23
    ),
    (
      'Quel projet entrepreneurial autour des cartes Pokémon Maxence a-t-il développé ? 🃏',
      'PokéScan', 'Dex TCG', 'CardEmpire', 'PokéMarket', 2,
      'Marketplace, reconnaissance des cartes et ambitions entrepreneuriales. Pour une fois, une idée de startup qui ne devrait pas mener directement en prison.',
      30, 24
    ),

    (
      'Combien de temps a-t-il fallu pour retrouver Léo lors du légendaire cache-cache à Lion-sur-Mer ? 🏰',
      '20 minutes', '45 minutes', '1h30', '3 heures', 3,
      'À ce stade, ce n''était plus une partie de cache-cache, c''était une enquête pour disparition inquiétante.',
      30, 25
    ),
    (
      'Quel est le rôle habituel de Maxence lors des soirées ? 🎉',
      'Le cuisinier', 'Le DJ', 'L''organisateur', 'Le squatteur', 3,
      'Un métier à plein temps, non rémunéré, avec des clients particulièrement exigeants.',
      30, 26
    ),
    (
      'Quel était le prénom du premier « ballon » de notre programme spatial autoroutier ? 🎈',
      'Véronique', 'Valérie', 'Chloé', 'Monique', 2,
      'Avant Véronique, il y avait Valérie. Les pionnières de l''aéronautique méritent le respect.',
      30, 27
    ),
    (
      'Qui a prévenu Maxence que sa startup Blink risquait de lui attirer quelques problèmes judiciaires ? ⚖️',
      'Alex', 'Adam', 'Rémi', 'Talvyn', 3,
      'Une intervention qui a probablement sauvé Maxence d''une reconversion professionnelle en milieu carcéral.',
      30, 28
    ),
    (
      'Comment Maxence faisait-il pour arriver en retard à ses propres soirées ? ⏰',
      'Il se perdait sur le chemin de chez lui', 'Il donnait ses clés aux invités ou restait dans sa salle de bain', 'Il oubliait systématiquement la date', 'Il attendait que tout le monde parte', 2,
      'Être à la fois l''organisateur, le propriétaire des lieux et le dernier arrivé. Un talent rare.',
      30, 29
    ),
    (
      'Quel cadeau Maxence aime-t-il traditionnellement offrir ? 🎁',
      'Des chocolats', 'Des cartes Pokémon', 'Des tickets à gratter', 'Des bouteilles de vin', 3,
      'Quelques euros investis, beaucoup d''espoir et généralement une déception collective. Mais un jour, quelqu''un deviendra millionnaire.',
      30, 30
    )
), current_order as (
  select coalesce(max(sort_order), 0) as max_sort_order
  from public.live_vote_questions
)
insert into public.live_vote_questions (
  mode,
  prompt,
  options,
  correct_player_key,
  suspects,
  reveal_note,
  timer_seconds,
  sort_order,
  is_active
)
select
  'who_said',
  new_questions.prompt,
  '[]'::jsonb,
  'answer:' || new_questions.correct_index::text,
  jsonb_build_array(
    jsonb_build_object('key', 'answer:1', 'label', new_questions.answer_a),
    jsonb_build_object('key', 'answer:2', 'label', new_questions.answer_b),
    jsonb_build_object('key', 'answer:3', 'label', new_questions.answer_c),
    jsonb_build_object('key', 'answer:4', 'label', new_questions.answer_d)
  ),
  new_questions.reveal_note,
  new_questions.timer_seconds,
  current_order.max_sort_order + new_questions.item_order * 10,
  true
from new_questions
cross join current_order
where not exists (
  select 1
  from public.live_vote_questions as existing
  where existing.mode = 'who_said'
    and existing.prompt = new_questions.prompt
);

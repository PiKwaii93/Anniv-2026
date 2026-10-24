with new_questions(
  mode,
  prompt,
  options,
  reveal_note,
  timer_seconds,
  item_order,
  is_active
) as (
  values
    ('likely', 'Qui est le plus susceptible d''organiser une contre-soirée alors que la soirée principale bat son plein ? 🏠', '[]'::jsonb, '', 30, 1, true),
    ('likely', 'Qui est le plus susceptible de fixer un rendez-vous à 8h et de se réveiller à 9h ? ⏰💀', '[]'::jsonb, '', 30, 2, true),
    ('likely', 'Qui est le plus susceptible de dévoiler un dossier de l''Iceberg au pire moment possible ? 🧊👀', '[]'::jsonb, '', 30, 3, true),
    ('likely', 'Qui est le plus susceptible de finir dans une histoire tellement improbable que personne ne le croira ? 🤡', '[]'::jsonb, '', 30, 4, true),
    ('likely', 'Qui est le plus susceptible de devenir le prochain Roi des charos ? 👑💘', '[]'::jsonb, '', 30, 5, true),
    ('likely', 'Qui est le plus susceptible de transformer une simple soirée en incident diplomatique avec les voisins ? 🏘️💀', '[]'::jsonb, '', 30, 6, true),

    ('majority', 'Quel objet mérite sa place au musée officiel de nos soirées ? 🏛️', '["La Table V3 🪑","Le plot de chantier 🚧","La spatule de la confession 🥄","Les chaises détruites par Adam 💀"]'::jsonb, '', 30, 7, true),
    ('majority', 'Quel running gag devrait être interdit pendant 24 heures pour préserver nos tympans ? 🔇', '["CIIEEEL ☁️","CHARGEEEE 🔫","ELLE EST MARIÉE 💍","L’imitation de Michou 🗣️"]'::jsonb, '', 30, 8, true),
    ('majority', 'Quelle tradition des soirées chez Maxence faut-il absolument préserver ? ❤️', '["Les crêpes 🥞","La raclette 🧀","Le beer pong 🏓","Les contre-soirées 🏠"]'::jsonb, '', 30, 9, true),
    ('majority', 'Quelle anecdote mériterait son propre film au cinéma ? 🎬', '["Le RDV 8H d’Adam ⏰","Le cache-cache de Léo 🏰","Le faux braquage d’Elena 🔫","Le fou du bus 🚌"]'::jsonb, '', 30, 10, true),
    ('majority', 'Quelle serait la pire chose à retrouver dans sa maison après une soirée ? 💀', '["Une chambre inondée 🌊","Une chaise cassée 🪑","Un plot de chantier 🚧","Des invités toujours présents à 10h 🛋️"]'::jsonb, '', 30, 11, true),
    ('majority', 'Si on devait organiser des vacances avec tout le groupe, quelle destination choisir ? ✈️', '["Barcarès chez Rémi 🏖️","Lion-sur-Mer chez Charlotte 🏰","Sérignan ☀️","La Corée du Sud 🇰🇷"]'::jsonb, '', 30, 12, true),

    ('predict', 'Selon toi, qui serait élu président officiel de nos soirées ? 🗳️', '["Maxence 👑","Adam 🦀","Alex 🐍","Talvyn 🤥"]'::jsonb, '', 30, 13, true),
    ('predict', 'Quel surnom serait élu le plus légendaire du groupe ? 🏆', '["Rebeu Charmant 🌹","Maxounette 💅","Snorezilla 🦖","Café Charbon ☕"]'::jsonb, '', 30, 14, true),
    ('predict', 'Selon toi, quel son déclencherait le plus gros hurlement collectif ? 📢', '["CIIEEEL ☁️","CHARGEEEE 🔫","ELLE EST MARIÉE 💍","HAHIHI 🗣️"]'::jsonb, '', 30, 15, true),
    ('predict', 'Quel événement le groupe choisirait-il d''effacer de l''histoire ? 🕰️', '["Le pied-bouche de Lucie 🦶","Les brioches volées 🥐","Le tir de Clément 🚀","Le RDV Disney à 8h ⏰"]'::jsonb, '', 30, 16, true),
    ('predict', 'Si le groupe devait élire une mascotte, laquelle gagnerait ? 🐾', '["Touffik 🐒","Chloé la voiture 🚗","Le MaxiBoule 🍃","Le plot de chantier 🚧"]'::jsonb, '', 30, 17, true),
    ('predict', 'Quel jeu serait élu discipline officielle des Olympiades du groupe ? 🥇', '["Beer pong 🏓","La pyramide 🔺","Shifutizz ✊","Le cache-cache 🏰"]'::jsonb, '', 30, 18, true)
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
  new_questions.mode,
  new_questions.prompt,
  new_questions.options,
  null,
  '[]'::jsonb,
  new_questions.reveal_note,
  new_questions.timer_seconds,
  current_order.max_sort_order + new_questions.item_order * 10,
  new_questions.is_active
from new_questions
cross join current_order
where not exists (
  select 1
  from public.live_vote_questions as existing
  where existing.mode = new_questions.mode
    and existing.prompt = new_questions.prompt
);

with quote_questions(
  prompt,
  reveal_note,
  correct_name,
  suspect_names,
  item_order,
  is_active
) as (
  values
    (
      '« Les gars, je viens de me réveiller. » ⏰💀',
      'Le rendez-vous pour Disneyland était fixé à 8h. À 9h, l’organisateur annonce tranquillement qu’il vient de se réveiller.',
      'Adam',
      array['Talvyn', 'Adam', 'Alex', 'Benji', 'Maxence']::text[],
      1,
      true
    ),
    (
      '« MES BRIOOOCHES ! » 🥐',
      'Un vol alimentaire odieux, commis par Matthis alors que la victime était immobilisée au beau milieu d’une partie de jeu.',
      'Maxence',
      array['Matthis', 'Clément', 'Maxence', 'Adam', 'Elio']::text[],
      2,
      true
    ),
    (
      '« C’EST TOI TU FERMES TA GUEULE ! » 🗣️💀',
      'Lors d’une soirée chez Séphora, un voisin se plaint du bruit. Une réponse d’une diplomatie exceptionnelle déclenche alors un incident international. Adam sera injustement soupçonné.',
      'Elio',
      array['Adam', 'Elio', 'Alex', 'Albano', 'Thomas N']::text[],
      3,
      true
    ),
    (
      '« GNAGNAGNA FERME TA GUEULE MAËL ! » 🎮',
      'Une discussion d’une grande maturité sur League of Legends, après que Maël a tenté de défendre un personnage qu’il jugeait « pas si fort ».',
      'Alex',
      array['Alex', 'Clément', 'Quentin', 'Talvyn', 'Elio']::text[],
      4,
      true
    ),
    (
      '« Le roi des charos, ce sera moi ! » 🏴‍☠️',
      'Une déclaration légendaire inspirée de One Piece, à l’origine de la transmission du fameux chapeau d’Adam à Quentin.',
      'Adam',
      array['Adam', 'Quentin', 'Rémi', 'Lorenzo', 'Maël']::text[],
      5,
      false
    ),
    (
      '« Un mec ! » 💀',
      'La question était pourtant simple : « Tu sais ce qui manque à Lucie ? ». Deux experts en délicatesse, Adam et Albano, ont alors proposé leurs analyses respectives : « Un mec ! » et « Des formes ! ».',
      'Adam',
      array['Albano', 'Adam', 'Alex', 'Clément', 'Talvyn']::text[],
      6,
      false
    )
), current_order as (
  select coalesce(max(sort_order), 0) as max_sort_order
  from public.live_vote_questions
), resolved as (
  select
    quote_questions.*,
    case
      when correct_guest.id is not null then 'guest:' || correct_guest.id::text
      else 'person:' || lower(quote_questions.correct_name)
    end as correct_player_key,
    (
      select jsonb_agg(
        jsonb_build_object(
          'key', case
            when matched_guest.id is not null then 'guest:' || matched_guest.id::text
            else 'person:' || lower(suspect.alias)
          end,
          'label', suspect.alias
        )
        order by suspect.position
      )
      from unnest(quote_questions.suspect_names) with ordinality as suspect(alias, position)
      left join lateral (
        select guest.id
        from public.guests as guest
        where guest.status = 'confirmed'
          and (
            lower(trim(guest.name)) = lower(suspect.alias)
            or lower(trim(guest.name)) like lower(suspect.alias) || ' %'
          )
        order by (lower(trim(guest.name)) = lower(suspect.alias)) desc, guest.name
        limit 1
      ) as matched_guest on true
    ) as suspects
  from quote_questions
  left join lateral (
    select guest.id
    from public.guests as guest
    where guest.status = 'confirmed'
      and (
        lower(trim(guest.name)) = lower(quote_questions.correct_name)
        or lower(trim(guest.name)) like lower(quote_questions.correct_name) || ' %'
      )
    order by (lower(trim(guest.name)) = lower(quote_questions.correct_name)) desc, guest.name
    limit 1
  ) as correct_guest on true
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
  resolved.prompt,
  '[]'::jsonb,
  resolved.correct_player_key,
  resolved.suspects,
  resolved.reveal_note,
  15,
  current_order.max_sort_order + resolved.item_order * 10,
  resolved.is_active
from resolved
cross join current_order
where not exists (
  select 1
  from public.live_vote_questions as existing
  where existing.mode = 'who_said'
    and existing.prompt = resolved.prompt
);

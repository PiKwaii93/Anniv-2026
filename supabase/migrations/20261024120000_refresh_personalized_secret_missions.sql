begin;

with replacements(old_text, new_text, difficulty, sort_order) as (
  values
    ('Place le mot « pingouin » dans une conversation sans que ça paraisse forcé.', 'Fais hurler « CIIEEEL » à quelqu’un sans le crier en premier. ☁️', 'easy', 10),
    ('Obtiens un high-five de trois personnes différentes.', 'Fais prononcer « CHARGEEEE » à quelqu’un au détour d’une conversation. 🔫', 'easy', 20),
    ('Fais dire « c’est pas faux » à quelqu’un.', 'Fais appeler Adam « Rebeu Charmant » par quelqu’un d’autre. 🌹', 'easy', 30),
    ('Fais rire quelqu’un sans raconter de blague.', 'Obtiens un magnifique « Giga Chad Face » de quelqu’un sur une photo. 🗿', 'easy', 40),
    ('Obtiens une photo où trois personnes font exactement la même pose.', 'Fais prononcer « Maxounette » à quelqu’un sans dire toi-même le prénom Maxence. 💅', 'easy', 50),
    ('Fais prononcer le mot « anniversaire » à quelqu’un sans le dire toi-même.', 'Fais avouer à quelqu’un son plus gros dossier de soirée. 👀', 'easy', 60),
    ('Fais changer quelqu’un de place sans lui demander directement de bouger.', 'Fais dire à quelqu’un que Maxence est riche. 💸', 'easy', 70),
    ('Reçois un compliment sans en réclamer un.', 'Demande à quelqu’un quel membre du groupe survivrait le moins longtemps sur une île déserte. 🏝️', 'easy', 80),
    ('Fais trinquer deux personnes qui ne discutaient pas ensemble.', 'Fais prononcer « MES BRIOOOCHES » à quelqu’un. 🥐', 'easy', 90),
    ('Amène quelqu’un à raconter son dernier film ou sa dernière série.', 'Obtiens une imitation de Michou ou d’Anyme. 🗣️', 'easy', 100),
    ('Fais apparaître spontanément un deuxième téléphone sur une photo.', 'Fais dire à quelqu’un que cette soirée est déjà partie trop loin. 💀', 'easy', 110),
    ('Obtiens trois poignées de main en moins de cinq minutes.', 'Fais raconter à quelqu’un son pire lendemain de soirée. 🤮', 'easy', 120),

    ('Convaincs quelqu’un pendant au moins trente secondes que tu as déjà rencontré une célébrité.', 'Déclenche un « ELLE EST MARIÉE ! » collectif avec au moins trois personnes. 💍', 'medium', 130),
    ('Place trois titres de films dans une même conversation sans être grillé.', 'Convaincs deux personnes que la Table V4 est déjà en préparation. 🪑', 'medium', 140),
    ('Fais lancer une chanson de ton choix par quelqu’un d’autre sans lui dire que c’est une mission.', 'Fais raconter un dossier embarrassant sur Maxence devant au moins trois invités. 🕵️', 'medium', 150),
    ('Amène deux personnes qui se connaissent peu à discuter ensemble.', 'Fais réaliser une chorégraphie improvisée à au moins trois personnes sans danser toi-même. 💃', 'medium', 160),
    ('Fais raconter à quelqu’un une anecdote de lycée devant au moins trois personnes.', 'Fais raconter l’histoire du « RDV 8H » d’Adam devant au moins deux personnes. ⏰', 'medium', 170),
    ('Obtiens une photo de groupe avec au moins cinq personnes sans prendre toi-même la photo.', 'Organise un vote improvisé pour désigner le plus gros charo du groupe, avec au moins quatre votants. 🏴‍☠️', 'medium', 180),
    ('Fais dire « on est vraiment vieux » à quelqu’un.', 'Fais demander à quelqu’un si Benji est toujours vivant alors qu’il est dans la soirée. 📦', 'medium', 190),
    ('Fais commencer une discussion sur un voyage sans prononcer le mot « voyage ».', 'Fais imiter le bruit du crabe d’Adam ou sa démarche par au moins deux personnes. 🦀', 'medium', 200),
    ('Fais choisir entre deux options absurdes à au moins trois personnes.', 'Déclenche un débat sur le meilleur couple fictif du groupe avec au moins trois participants. 💘', 'medium', 210),
    ('Fais qu’une personne te présente à une autre alors que vous vous connaissez déjà.', 'Fais raconter une anecdote de l’Iceberg à quelqu’un qui ne la connaît pas. 🧊', 'medium', 220),
    ('Fais apparaître un objet totalement banal au centre d’une discussion pendant une minute.', 'Fais croire pendant une minute que tu connais un énorme secret sur un invité, sans inventer d’accusation compromettante. 🤫', 'medium', 230),
    ('Fais reprendre une de tes expressions par quelqu’un dans la soirée.', 'Fais scander « ON TE BZ MAXENCE ! » par au moins trois personnes sans le lancer toi-même. ❤️', 'medium', 240),

    ('Fais démarrer un mini-applaudissement sans annoncer pourquoi.', 'Déclenche « CIIEEEL », « CHARGEEEE » et « ELLE EST MARIÉE ! » en moins de trois minutes, sans les lancer toi-même. 🎤', 'hard', 250),
    ('Fais croire pendant une minute qu’une tradition familiale complètement absurde existe chez toi.', 'Organise une contre-soirée improvisée avec au moins quatre personnes pendant cinq minutes, sans annoncer que c’est une mission. 🏠', 'hard', 260),
    ('Fais en sorte qu’au moins quatre personnes regardent simultanément dans la même direction.', 'Fais participer au moins cinq personnes à un débat pour élire la pire excuse jamais sortie pour éviter une soirée. 🤥', 'hard', 270),
    ('Fais raconter la même anecdote par deux personnes différentes sans leur révéler ton objectif.', 'Fais ouvrir spontanément l’Iceberg à quelqu’un pour vérifier une histoire, sans lui demander d’ouvrir l’application. 🧊', 'hard', 280),
    ('Fais naître un débat sérieux à partir d’un sujet parfaitement ridicule.', 'Convaincs au moins quatre personnes de participer au procès fictif d’une anecdote légendaire du groupe. ⚖️', 'hard', 290),
    ('Fais qu’un groupe d’au moins quatre personnes adopte la même pose pour une photo sans prononcer le mot « pose ».', 'Fais reprendre une expression totalement inventée par au moins trois personnes différentes au cours de la soirée. 🗣️', 'hard', 300),
    ('Fais que quelqu’un ouvre l’Iceberg de lui-même pendant votre conversation.', 'Obtiens une photo d’au moins cinq personnes reproduisant une scène dramatique digne d’une téléréalité. 📸', 'hard', 310),
    ('Fais qu’une personne te demande spontanément « pourquoi ? ».', 'Fais raconter la même anecdote gênante par deux témoins différents, puis provoque un débat sur leurs versions. 🔍', 'hard', 320),
    ('Fais citer trois pays différents par trois personnes différentes en moins de cinq minutes.', 'Fais acclamer quelqu’un comme le nouveau « Roi des charos » par au moins quatre personnes. 👑', 'hard', 330),
    ('Fais lancer un vote improvisé sur une question inutile et obtiens au moins quatre réponses.', 'Fais improviser une minute de silence solennelle en hommage à un objet disparu ou détruit pendant une ancienne soirée. 🪦', 'hard', 340),
    ('Fais qu’une personne raconte volontairement une anecdote gênante sur elle-même.', 'Fais proposer spontanément une nouvelle anecdote pour l’Iceberg et obtiens l’approbation de trois personnes. 📝', 'hard', 350),
    ('Fais qu’au moins trois personnes répètent le même mot dans la même conversation.', 'Déclenche une standing ovation d’au moins cinq personnes pour une raison absolument ridicule, sans expliquer pourquoi. 👏', 'hard', 360)
), updated as (
  update public.secret_mission_prompts as prompt
  set text = replacements.new_text,
      difficulty = replacements.difficulty,
      sort_order = replacements.sort_order,
      is_active = true,
      updated_at = now()
  from replacements
  where prompt.text = replacements.old_text
  returning replacements.new_text
)
insert into public.secret_mission_prompts (text, difficulty, sort_order, is_active)
select replacements.new_text, replacements.difficulty, replacements.sort_order, true
from replacements
where not exists (
  select 1
  from updated
  where updated.new_text = replacements.new_text
)
and not exists (
  select 1
  from public.secret_mission_prompts as prompt
  where prompt.text = replacements.new_text
);

commit;

create table if not exists public.bingo_prompts (
  id uuid primary key default gen_random_uuid(),
  text text not null check (char_length(trim(text)) > 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (text)
);

alter table public.bingo_prompts enable row level security;

create policy "Public can read active bingo prompts"
on public.bingo_prompts
for select
using (is_active = true);

create policy "Admins can read all bingo prompts"
on public.bingo_prompts
for select
using (
  exists (
    select 1
    from public.app_admins
    where app_admins.user_id = auth.uid()
  )
);

create policy "Admins can insert bingo prompts"
on public.bingo_prompts
for insert
with check (
  exists (
    select 1
    from public.app_admins
    where app_admins.user_id = auth.uid()
  )
);

create policy "Admins can update bingo prompts"
on public.bingo_prompts
for update
using (
  exists (
    select 1
    from public.app_admins
    where app_admins.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.app_admins
    where app_admins.user_id = auth.uid()
  )
);

create policy "Admins can delete bingo prompts"
on public.bingo_prompts
for delete
using (
  exists (
    select 1
    from public.app_admins
    where app_admins.user_id = auth.uid()
  )
);

insert into public.bingo_prompts (text, sort_order, is_active)
values
('Charlotte lance une choré 👯‍♀️', 10, true),
('Thomas N / Sephora Octogone 🥊', 20, true),
('Maël s''asseoit et bouge plus pendant 1h 🛋️', 30, true),
('Alex lance des shots 🥃', 40, true),
('Talvyn lance un sujet de cul 🍑', 50, true),
('Quelqu''un lance un Tu préfères 🤔', 60, true),
('On a perdu quelqu''un 👤', 70, true),
('Lucie perd au beer pong 📉', 80, true),
('Quelqu''un gratte un ticket à gratter 🎰', 90, true),
('Clément twerk 💃', 100, true),
('Danse sexy d''Elena 🔥', 110, true),
('Karaoké Kongolese sous bbl 🎤🐒', 120, true),
('Quelqu''un vomit 🤮', 130, true),
('Couple se galoche 💋', 140, true),
('Striptease / limousin 🤠', 150, true),
('Lorenzo masse quelqu''un 💆‍♂️', 160, true),
('Adam est aigri 😠', 170, true),
('Adam est plus aigri car il a vu une fille qui lui plaît 😏', 180, true),
('Pam fais son geek Yu-Gi-Oh 👾', 190, true),
('Rémi giga chad face 😎', 200, true),
('Shacon perd au shifutizz 🃏', 210, true),
('Benji est présent ✅', 220, true),
('Albano accuse quelqu''un d''être raciste 🗣️', 230, true),
('Maxence est accusé de racisme 🛑', 240, true),
('Maxence fait miaou miaou 😾', 250, true),
('Quentin fume des substances 💨', 260, true),
('Florian cul sec 🥤', 270, true),
('Quelqu''un d''autre prend le coktail du chef 🍹', 280, true),
('Mathilde s''endort / rentré 😴🚪', 290, true),
('Taïs marche sur quelqu''un 👣', 300, true),
('Oriane / Lucie Octogone 🤼‍♀️', 310, true),
('Killer terminé 🔪', 320, true),
('Assassin terminé 🎯', 330, true),
('Alex fait Blue Star sur just dance 🕺', 340, true),
('Maxence souffle ses bougies 🎂', 350, true),
('Quelqu''un réussi une double traversée du désert 🌵🌵', 360, true),
('Clément se fait claquer le cul 👋🍑', 370, true),
('Maxence se fait claquer le cul 👋🍑', 380, true),
('Lorenzo fait une déclaration d''amitié 🥰', 390, true),
('Alison joue à un jeu d''alcool 🎲', 400, true),
('Ethan RP Ekko ⏳', 410, true),
('Elio est raciste 😡', 420, true),
('Inès sociabilise avec tout le monde 💬', 430, true),
('Elena hurle ! 😱', 440, true),
('Session JDR 🐉', 450, true),
('Oriane écrase quelqu''un avec des échasses 🦵💥', 460, true),
('Carrelage qui saute 💣', 470, true),
('Chaise cassée 🔨', 480, true),
('Verre cassé 🍸❌', 490, true),
('Quelqu''un reverse un verre 💧', 500, true),
('Session confessionnal 🤫', 510, true),
('Spatule de la confession 🥄', 520, true),
('Carla se trémousse sur le dancefloor 🎶', 530, true),
('Thomas N boit de l''alcool 😱🍷', 540, true),
('Mathis parle de LoL 🎮', 550, true),
('Matthis fait son vieux 👴', 560, true),
('Une contre soirée à lieu 🏘️', 570, true),
('Joachim prend un Narnia 🧥', 580, true),
('Lycia se fait draguer par une meuf 🏳️‍🌈', 590, true),
('Élodie gagne au beer pong 🏆', 600, true),
('Maël parle politique 🏛️', 610, true),
('Camille H découvre l''iceberg 🧊', 620, true),
('Camille boit pour oublier 😢🍺', 630, true),
('Quelqu''un commande a manger 🍕', 640, true),
('Edy natural 20 ✨', 650, true),
('Arthur rage 🤬', 660, true),
('Maxence aime pas ses cadeaux 🎁👎', 670, true),
('Maxence aime ses cadeaux 🎁👍', 680, true),
('Quelqu''un part faire un tour 🚶‍♂️', 690, true),
('Quelqu''un arrive 4+ heures en retard ⏱️', 700, true),
('Alexandra se plaint de l''école 📚', 710, true),
('Hortense prépare un coktail signature 🍸👌', 720, true),
('Réunion dans la chambre de Maxence 🤫', 730, true),
('Toilettes a 2 ? 🚻', 740, true),
('Lucie tape quelqu''un 🤛', 750, true),
('Pam gagné au beer pong 🥇', 760, true),
('Alex se fait frapper 🤕', 770, true),
('Maxence se fait agresser 😠', 780, true),
('Rémi est trop beau 😍', 790, true),
('Alex est un sale traître 🐍', 800, true),
('Alex passe pour un raciste 🤦‍♂️', 810, true),
('Talvyn sort une excuse 🤥', 820, true),
('Talvyn reste 30min devant la maison avant de rentrer 🚪', 830, true),
('Corentin donne son avis sur un film 🎬', 840, true),
('Lorenzo fait son daron 👨‍👧', 850, true),
('Sephora fait sa bad bitch 💅', 860, true),
('Léa bat quelqu''un à une épreuve physique 💪', 870, true),
('Fanny drague quelqu''un 😉', 880, true),
('Pam parle de son mariage 💍', 890, true),
('Pam parle de son EVG 🤵‍♂️', 900, true),
('Pam découvre les secrets de l''EVJF 🤫👰‍♀️', 910, true),
('Fanny parle de son mariage 💍', 920, true),
('Fanny parle de son EVJF 👰‍♀️', 930, true),
('Fanny découvre les secrets de l''EVG 🤫🤵‍♂️', 940, true),
('Sephora chante mal 🎶😂', 950, true),
('Un Disney passe 🏰', 960, true),
('Quelqu''un déchire un vêtement 👚 rip', 970, true),
('Elio vient bien habillé 👔', 980, true),
('Quelqu''un vient en joggo 🏃‍♀️', 990, true),
('Elio fait une tirade en japonais 🇯🇵', 1000, true),
('Pyramide 🔺', 1010, true),
('Traversée du désert 🥃🌵', 1020, true),
('Purple +12 🍇', 1030, true),
('Rémi se trémousse sur Dualipa 🕺🎵', 1040, true),
('Sephora se trémousse sur du Rihanna 💃🎵', 1050, true),
('Elena est trop belle ✨', 1060, true),
('Quelqu''un explique les tréfonds le l''iceberg 🧐🧊', 1070, true),
('Quelqu''un rajoute un élément a l''iceberg 📝🧊', 1080, true),
('Charlotte cul sec 🍻', 1090, true),
('Charlotte joue une partie de beer pong 🏓', 1100, true),
('Mathilde danse un slow 🕯️', 1110, true),
('Mathilde gagne à un jeu d''alcool 🥂', 1120, true),
('Maël parle d''Halloween 🎃', 1130, true),
('Adam casse là démarche 🚶‍♂️🚶‍♂️', 1140, true),
('Albano casse là démarche 🚶‍♂️🚶‍♂️', 1150, true),
('Adam se fait vénérer 🙏', 1160, true),
('Albano & Adam session vannes 😂', 1170, true),
('Clément F lance une compétition de twerk 🍑🏆', 1180, true),
('Clément soulève quelqu''un 🏋️‍♂️', 1190, true),
('Chacon coktail signature 🍹', 1200, true),
('Arthur double cul sec 🥃🥃', 1210, true),
('Maxence frappe Sephora 👊', 1220, true),
('Maxence fait le jeu de la ceinture à quelqu''un 👌', 1230, true),
('Charlotte prends 3 shots dans la soirée 🍹🍹🍹', 1240, true),
('Charlotte se présente en tant que falucharde 🎓', 1250, true),
('Elena RP réception hôtel 🛎️', 1260, true),
('Sephora maquille quelqu''un 💄', 1270, true),
('Adam fait une de déclaration de guerre à Disney ⚔️🐭', 1280, true),
('Albano atomise quelqu''un au beer pong 💣🏓', 1290, true),
('Quelqu''un joue à LoL 💻', 1300, true),
('Elio raconte son anecdotes iceberg 📖🧊', 1310, true),
('Sephora raconte son anecdotes iceberg 📖🧊', 1320, true),
('quelqu''un perd a la traversé du désert 😭🌵', 1330, true),
('Alex crie les sons d''été ☀️🔊', 1340, true),
('Alexandra gagne contre quelqu''un de LS 🥇', 1350, true),
('Alison cul sec 🍻', 1360, true),
('Baptiste perds au beer pong 🥺🏓', 1370, true),
('Baptiste reste avec sa copine 👩‍❤️‍👨', 1380, true),
('Benji se fait maquiller 🎨', 1390, true),
('Benji rattrape le temps perdu (tout les sens du terme) ⏳😅', 1400, true),
('Benji cul sec 🍻', 1410, true),
('Camille apprend l''iceberg 🤓🧊', 1420, true),
('Edy apprend l''iceberg 🤓🧊', 1430, true),
('Camille H rattrape le temps perdu 🏃‍♀️💨', 1440, true),
('Faites en sorte que carla fasse partie du groupe soirée 🍻👯‍♀️', 1450, true),
('Faites en sortes que Inès fasse partie du groupe soirée 🍻👯‍♀️', 1460, true),
('Elena sauve quelqu''un 🚑', 1470, true),
('Elena verse de l''alcool dans la bouche de quelqu''un 👄🥂', 1480, true),
('Rappeler a Ethan que c''est un jeunot 👶', 1490, true),
('Quelqu''un se plaint de la musique 🔇', 1500, true)
on conflict (text) do nothing;

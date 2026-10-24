with new_prompts(text, item_order) as (
  values
    ('Maxence tente de justifier ses 2 heures passées dans la salle de bain 🪞💅', 1),
    ('Alex ressort son légendaire « GNAGNAGNA FERME TA GUEULE MAËL ! » 🎮', 2),
    ('Séphora tente de réécrire une anecdote de l''Iceberg à son avantage 🧊🤥', 3),
    ('Julien réclame des preuves face à une histoire complètement improbable du groupe 🕵️', 4),
    ('Adam nous offre une démonstration de sa fameuse démarche de crabe 🦀', 5),
    ('Albano tente de se défendre face à une accusation absolument ridicule ⚖️💀', 6),
    ('Elio raconte sa version de l''affaire Monster Munch 👻', 7),
    ('Elena tente de calmer une embrouille complètement ridicule entre deux invités 🕊️', 8),
    ('Charlotte raconte les coulisses du légendaire cache-cache de Lion-sur-Mer 🏰', 9),
    ('Mathilde attribue une note artistique à la danse de quelqu''un 💃', 10),
    ('Lucie dénonce une injustice flagrante pendant un jeu ⚖️', 11),
    ('Rémi explique pourquoi une idée de business de Maxence pourrait finir au tribunal 👨‍⚖️💸', 12),
    ('Benji nous résume les 12 derniers mois de sa vie comme s''il revenait d''exil 🏝️', 13),
    ('Lorenzo intervient pour régler un débat comme un médiateur de l''ONU 🌍', 14),
    ('Clément tente de justifier son fameux tir de handball envoyé dans la stratosphère 🚀', 15),
    ('Orianne devient arbitre improvisée d''un duel complètement ridicule ⚔️', 16),
    ('Quentin revendique officiellement son titre de Roi des charos 👑🏴‍☠️', 17),
    ('Ethan fait une référence que les vieux du groupe ne comprennent absolument pas 👶', 18),
    ('Mathis Nickels analyse une partie de beer pong comme s''il s''agissait d''une finale de League of Legends 🎮🏓', 19),
    ('Talvyn nous raconte les secrets de sa fameuse RedRoom 🔴👀', 20),
    ('Thomas N raconte sa version du fameux octogone avec Séphora 🥊', 21),
    ('Nico défend sérieusement une opinion complètement absurde pendant au moins 30 secondes 🤓', 22),
    ('Seb commente un événement banal comme s''il s''agissait d''une finale de Coupe du monde 🎙️🏆', 23),
    ('Bérénice réclame des explications sur une anecdote particulièrement sombre de l''Iceberg 🧊💀', 24),
    ('Pam compare un membre du groupe à une carte Yu-Gi-Oh 🃏', 25),
    ('Fanny attribue une note sur 10 à une technique de drague complètement ridicule 💘', 26),
    ('Alexandrine réclame un match retour après une partie de jeu 🎮⚔️', 27),
    ('Élodie donne une leçon de technique au beer pong à quelqu''un 🏓🎯', 28),
    ('Joachim explique à quelqu''un le concept du légendaire Narnia 🧥', 29),
    ('Matthis tente de justifier le vol des brioches de Maxence 🥐⚖️', 30),
    ('Nolan se retrouve embarqué dans une photo de groupe complètement absurde 📸', 31),
    ('Paloma réussit à faire rougir Maxence devant d''autres invités 🥹❤️', 32),
    ('Lycia raconte une anecdote qui provoque un « MAIS QUOI ?! » chez quelqu''un 😱', 33),
    ('Maël défend pendant au moins une minute un personnage de LoL que les autres critiquent 🎮', 34),
    ('Baptiste tente de recruter un partenaire pour prendre sa revanche au beer pong 🏓', 35),
    ('Louann donne un prénom ridicule à un objet de la soirée, et quelqu''un le réutilise 🏷️💀', 36),
    ('Paul donne un conseil de handball pour améliorer un tir de beer pong 🤾‍♂️🍻', 37),
    ('Thomas B et Thomas N répondent simultanément quand quelqu''un appelle « Thomas ! » 👯‍♂️', 38),
    ('Jed se retrouve embarqué dans une activité de groupe sans avoir compris les règles 🎲😂', 39),
    ('Thomas découvre qu''il existe beaucoup trop de Thomas dans cette soirée et qu''il faut désormais les numéroter 🔢💀', 40),
    ('Mathis se retrouve dans un débat pour déterminer combien de Mathis/Matthis sont présents à cette soirée 👥', 41),
    ('Axel devient le coach improvisé d''un joueur de beer pong 🏓🧑‍🏫', 42),
    ('Ines affirme avoir déjà compris le fonctionnement complètement chaotique du groupe 🤯', 43),
    ('Ivana reçoit le résumé beaucoup trop dramatique d''une anecdote de l''Iceberg 🧊🎭', 44)
), current_order as (
  select coalesce(max(sort_order), 0) as max_sort_order
  from public.bingo_prompts
)
insert into public.bingo_prompts (text, sort_order, is_active)
select
  new_prompts.text,
  current_order.max_sort_order + new_prompts.item_order * 10,
  true
from new_prompts
cross join current_order
where not exists (
  select 1
  from public.bingo_prompts as existing
  where existing.text = new_prompts.text
)
on conflict (text) do nothing;

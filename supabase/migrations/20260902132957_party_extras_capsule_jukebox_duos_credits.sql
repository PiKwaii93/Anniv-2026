-- Additive schema; public entry points enforce existing guest sessions or admin JWTs.
create schema if not exists party_extras;
grant usage on schema party_extras to anon, authenticated;

create table party_extras.settings (
  id boolean primary key default true check (id),
  capsule_visible boolean not null default true,
  capsule_open boolean not null default true,
  capsule_reveal_at timestamptz not null default '2026-10-25 12:00:00 Europe/Paris',
  jukebox_visible boolean not null default true,
  jukebox_open boolean not null default true,
  duos_visible boolean not null default true,
  duos_open boolean not null default true,
  credits_enabled boolean not null default true,
  credits_run uuid not null default gen_random_uuid()
);
insert into party_extras.settings default values;
create table party_extras.letters (
  player_key text primary key,
  player_name text not null,
  message text not null default '' check (length(message) <= 1200),
  memory text not null default '' check (length(memory) <= 800),
  prediction text not null default '' check (length(prediction) <= 800),
  updated_at timestamptz not null default now(),
  check (length(btrim(message || memory || prediction)) > 0)
);
create table party_extras.songs (
  id uuid primary key default gen_random_uuid(),
  player_key text not null,
  player_name text not null,
  title text not null check (length(btrim(title)) between 1 and 100),
  artist text not null check (length(btrim(artist)) between 1 and 100),
  link text not null default '' check (length(link) <= 500),
  status text not null default 'pending' check (status in ('pending','queued','playing','played','rejected')),
  created_at timestamptz not null default now()
);
create unique index songs_unique_track on party_extras.songs (lower(btrim(title)), lower(btrim(artist)));
create unique index songs_one_playing on party_extras.songs (status) where status = 'playing';
create index songs_by_player on party_extras.songs (player_key);
create table party_extras.votes (
  song_id uuid not null references party_extras.songs(id) on delete cascade,
  player_key text not null,
  primary key (song_id, player_key)
);
create table party_extras.duo_prompts (
  id bigint generated always as identity primary key,
  prompt text not null
);
insert into party_extras.duo_prompts(prompt) values
 ('Trouvez trois points communs que vous ne connaissiez pas, puis racontez-en un à une autre personne.'),
 ('Inventez ensemble un toast de dix secondes pour Maxence, puis dites-le à un petit groupe.'),
 ('Recréez une affiche de film avec les moyens du bord. Une photo est facultative.'),
 ('Apprenez chacun à l’autre un petit talent : dessin, geste sportif, expression ou tour de passe-passe.'),
 ('Imaginez le titre d’un film sur cette soirée et présentez son scénario en deux phrases.'),
 ('Trouvez une chanson que vous aimez tous les deux et proposez-la au jukebox.'),
 ('Dessinez le portrait de Maxence à quatre mains, sur papier ou sur un téléphone.'),
 ('Chacun raconte son premier souvenir avec Maxence, puis vous trouvez ce que ces histoires ont en commun.');
create table party_extras.duo_queue (
  player_key text primary key,
  player_name text not null,
  joined_at timestamptz not null default now()
);
create table party_extras.duo_matches (
  id uuid primary key default gen_random_uuid(),
  player_a text not null,
  player_b text not null,
  name_a text not null,
  name_b text not null,
  prompt text not null,
  confirmed_a boolean not null default false,
  confirmed_b boolean not null default false,
  status text not null default 'active' check (status in ('active','completed','skipped')),
  created_at timestamptz not null default now(),
  check (player_a <> player_b)
);
create index duos_by_a on party_extras.duo_matches(player_a, created_at desc);
create index duos_by_b on party_extras.duo_matches(player_b, created_at desc);
create unique index duos_unique_active_a on party_extras.duo_matches(player_a) where status='active';
create unique index duos_unique_active_b on party_extras.duo_matches(player_b) where status='active';

alter table party_extras.settings enable row level security;
alter table party_extras.letters enable row level security;
alter table party_extras.songs enable row level security;
alter table party_extras.votes enable row level security;
alter table party_extras.duo_prompts enable row level security;
alter table party_extras.duo_queue enable row level security;
alter table party_extras.duo_matches enable row level security;
revoke all on all tables in schema party_extras from public, anon, authenticated;
revoke all on all sequences in schema party_extras from public, anon, authenticated;

create function party_extras.identity_name(p_player_key text, p_session_token uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare v_name text;
begin
 select s.player_name into v_name from public.party_identity_sessions s
 where s.player_key=p_player_key and s.session_token=p_session_token;
 if v_name is null or public.live_vote_player_name(p_player_key) is null then
   raise exception 'IDENTITY_REQUIRED';
 end if;
 return v_name;
end;
$$;
revoke all on function party_extras.identity_name(text,uuid) from public, anon, authenticated;

create function party_extras.state(p_player_key text, p_session_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 cfg party_extras.settings%rowtype;
 ps public.party_state%rowtype;
 v_admin boolean := exists(select 1 from public.app_admins where user_id=(select auth.uid()));
 v_name text;
 v_own jsonb := null;
 v_letters jsonb := '[]';
 v_songs jsonb := '[]';
 v_duo jsonb := null;
 v_names jsonb := '[]';
 v_count integer := 0;
 v_song_count integer := 0;
 v_attempts integer := 0;
begin
 select * into cfg from party_extras.settings where id;
 select * into ps from public.party_state where id='main';
 if p_player_key is not null or p_session_token is not null then
   v_name := party_extras.identity_name(p_player_key,p_session_token);
 end if;
 if v_name is not null then
   select to_jsonb(l)-'player_key' into v_own from party_extras.letters l where player_key=p_player_key;
   select count(*) into v_song_count from party_extras.songs where player_key=p_player_key;
   select count(*) into v_attempts from party_extras.duo_matches where player_a=p_player_key or player_b=p_player_key;
   select jsonb_build_object('id',d.id,'partner',case when d.player_a=p_player_key then d.name_b else d.name_a end,
     'prompt',d.prompt,'status',d.status,'confirmed',case when d.player_a=p_player_key then d.confirmed_a else d.confirmed_b end,
     'partner_confirmed',case when d.player_a=p_player_key then d.confirmed_b else d.confirmed_a end)
   into v_duo from party_extras.duo_matches d where d.player_a=p_player_key or d.player_b=p_player_key
   order by d.created_at desc,d.id desc limit 1;
 end if;
 if v_admin then
   select count(*) into v_count from party_extras.letters;
   if now() >= cfg.capsule_reveal_at then
     select coalesce(jsonb_agg(to_jsonb(l)-'player_key' order by l.player_name),'[]') into v_letters from party_extras.letters l;
   end if;
 end if;
 if cfg.jukebox_visible or v_admin then
   select coalesce(jsonb_agg(row_data order by priority,vote_count desc,created_at,id),'[]') into v_songs from (
     select s.id,s.created_at,case s.status when 'playing' then 0 when 'pending' then 1 when 'queued' then 2 else 3 end as priority,
       (select count(*) from party_extras.votes v where v.song_id=s.id) as vote_count,
       jsonb_build_object('id',s.id,'title',s.title,'artist',s.artist,'link',s.link,'status',s.status,'player_name',s.player_name,
       'mine',coalesce(s.player_key=p_player_key,false),'votes',(select count(*) from party_extras.votes v where v.song_id=s.id),
       'voted',exists(select 1 from party_extras.votes v where v.song_id=s.id and v.player_key=p_player_key)) as row_data
     from party_extras.songs s where v_admin or s.status in ('queued','playing','played') or s.player_key=p_player_key
   ) ranked;
 end if;
 if ps.phase='ended' and ps.guests_visible then
   select coalesce(jsonb_agg(n.name order by n.name),'[]') into v_names from (
     select name from public.guests where status='confirmed'
     union all select po.name from public.plus_ones po join public.guests g on g.id=po.guest_id where g.status='confirmed'
   ) n;
 end if;
 return jsonb_build_object('ok',true,'settings',to_jsonb(cfg)-'id','phase',ps.phase,
   'ending_key',ps.updated_at::text || ':' || cfg.credits_run::text,
   'capsule',jsonb_build_object('own',v_own,'count',v_count,'revealed',now() >= cfg.capsule_reveal_at,'entries',v_letters),
   'songs',v_songs,'song_count',v_song_count,
   'duo',v_duo,'duo_attempts',v_attempts,'waiting',exists(select 1 from party_extras.duo_queue where player_key=p_player_key),
   'duo_stats',jsonb_build_object('waiting',(select count(*) from party_extras.duo_queue),
     'completed',(select count(*) from party_extras.duo_matches where status='completed')),
   'credits_names',v_names);
end;
$$;
revoke all on function party_extras.state(text,uuid) from public;
grant execute on function party_extras.state(text,uuid) to anon, authenticated;
create function public.get_party_extras(p_player_key text default null,p_session_token uuid default null)
returns jsonb language sql security invoker set search_path='' as $$ select party_extras.state(p_player_key,p_session_token); $$;
revoke all on function public.get_party_extras(text,uuid) from public;
grant execute on function public.get_party_extras(text,uuid) to anon,authenticated;

create function party_extras.act(p_action text,p_payload jsonb,p_player_key text,p_session_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 cfg party_extras.settings%rowtype;
 v_phase text;
 v_name text;
 v_id uuid;
 v_other party_extras.duo_queue%rowtype;
 v_match party_extras.duo_matches%rowtype;
 v_title text;
 v_artist text;
 v_link text;
 v_status text;
 v_target text;
 v_prompt text;
 v_admin boolean := exists(select 1 from public.app_admins where user_id=(select auth.uid()));
begin
 -- Serializes settings with guest writes; the party is small and this also makes quotas atomic.
 select * into cfg from party_extras.settings where id for update;
 select phase into v_phase from public.party_state where id='main';
 if p_action like 'admin_%' then
   if not v_admin then raise exception 'NOT_ADMIN'; end if;
   if p_action='admin_settings' then
     update party_extras.settings set
       capsule_visible=coalesce((p_payload->>'capsule_visible')::boolean,capsule_visible),
       capsule_open=coalesce((p_payload->>'capsule_open')::boolean,capsule_open),
       jukebox_visible=coalesce((p_payload->>'jukebox_visible')::boolean,jukebox_visible),
       jukebox_open=coalesce((p_payload->>'jukebox_open')::boolean,jukebox_open),
       duos_visible=coalesce((p_payload->>'duos_visible')::boolean,duos_visible),
       duos_open=coalesce((p_payload->>'duos_open')::boolean,duos_open),
       credits_enabled=coalesce((p_payload->>'credits_enabled')::boolean,credits_enabled)
     where id;
     if p_payload ? 'capsule_timing' then
       if p_payload->>'capsule_timing' not in ('after_party','next_birthday') then raise exception 'INVALID_INPUT'; end if;
       update party_extras.settings set capsule_reveal_at=case p_payload->>'capsule_timing'
         when 'after_party' then '2026-10-25 12:00:00 Europe/Paris'::timestamptz else '2027-10-24 12:00:00 Europe/Paris'::timestamptz end where id;
     end if;
   elsif p_action='admin_song' then
     v_id:=(p_payload->>'id')::uuid;
     v_target:=p_payload->>'status';
     select status into v_status from party_extras.songs where id=v_id for update;
     if v_status is null then raise exception 'NOT_FOUND'; end if;
     if not ((v_target='queued' and v_status in ('pending','rejected','played'))
       or (v_target='rejected' and v_status in ('pending','queued'))
       or (v_target='playing' and v_status='queued')
       or (v_target='played' and v_status in ('queued','playing'))) then raise exception 'INVALID_TRANSITION'; end if;
     if v_target='playing' then update party_extras.songs set status='played' where status='playing'; end if;
     update party_extras.songs set status=v_target where id=v_id;
   elsif p_action='admin_credits' then
     if v_phase <> 'ended' then raise exception 'PARTY_NOT_ENDED'; end if;
     update party_extras.settings set credits_enabled=true,credits_run=gen_random_uuid() where id;
   else raise exception 'INVALID_ACTION';
   end if;
   return jsonb_build_object('ok',true);
 end if;
 v_name:=party_extras.identity_name(p_player_key,p_session_token);
 if p_action='capsule_save' then
   if not cfg.capsule_visible or not cfg.capsule_open or now() >= cfg.capsule_reveal_at then raise exception 'CAPSULE_CLOSED'; end if;
   insert into party_extras.letters(player_key,player_name,message,memory,prediction)
   values(p_player_key,v_name,btrim(coalesce(p_payload->>'message','')),btrim(coalesce(p_payload->>'memory','')),btrim(coalesce(p_payload->>'prediction','')))
   on conflict(player_key) do update set player_name=excluded.player_name,message=excluded.message,memory=excluded.memory,prediction=excluded.prediction,updated_at=now();
 elsif p_action in ('song_submit','song_vote') then
   if not cfg.jukebox_visible or not cfg.jukebox_open or v_phase='ended' then raise exception 'JUKEBOX_CLOSED'; end if;
   if p_action='song_submit' then
     if (select count(*) from party_extras.songs where player_key=p_player_key)>=3 then raise exception 'SONG_LIMIT'; end if;
     v_title:=btrim(coalesce(p_payload->>'title','')); v_artist:=btrim(coalesce(p_payload->>'artist','')); v_link:=btrim(coalesce(p_payload->>'link',''));
     if v_link <> '' and v_link !~* '^https://(open\.spotify\.com|www\.youtube\.com|youtube\.com|youtu\.be|music\.youtube\.com|music\.apple\.com|www\.deezer\.com|deezer\.com)/[^[:space:]]*$' then raise exception 'INVALID_LINK'; end if;
     if exists(select 1 from party_extras.songs where lower(btrim(title))=lower(v_title) and lower(btrim(artist))=lower(v_artist)) then raise exception 'SONG_EXISTS'; end if;
     insert into party_extras.songs(player_key,player_name,title,artist,link) values(p_player_key,v_name,v_title,v_artist,v_link);
   else
     v_id:=(p_payload->>'id')::uuid;
     if not exists(select 1 from party_extras.songs where id=v_id and status='queued') then raise exception 'VOTE_CLOSED'; end if;
     if coalesce((p_payload->>'voted')::boolean,false) then
       insert into party_extras.votes(song_id,player_key) values(v_id,p_player_key) on conflict do nothing;
     else delete from party_extras.votes where song_id=v_id and player_key=p_player_key;
     end if;
   end if;
 elsif p_action in ('duo_join','duo_leave','duo_confirm','duo_skip') then
   -- One lock covers both member columns and prevents a player joining concurrent pairs.
   perform pg_advisory_xact_lock(hashtextextended('party-extras-duos',0));
   if p_action='duo_leave' then delete from party_extras.duo_queue where player_key=p_player_key;
   elsif p_action='duo_skip' then
     v_id:=(p_payload->>'id')::uuid;
     update party_extras.duo_matches set status='skipped' where id=v_id and status='active' and p_player_key in (player_a,player_b);
     if not found then raise exception 'DUO_NOT_ACTIVE'; end if;
   else
     if not cfg.duos_visible or not cfg.duos_open or v_phase <> 'live' then raise exception 'DUOS_CLOSED'; end if;
     if p_action='duo_confirm' then
       v_id:=(p_payload->>'id')::uuid;
       select * into v_match from party_extras.duo_matches where id=v_id and p_player_key in (player_a,player_b) for update;
       if not found then raise exception 'DUO_NOT_ACTIVE'; end if;
       if v_match.status='completed' then return jsonb_build_object('ok',true); end if;
       if v_match.status <> 'active' then raise exception 'DUO_NOT_ACTIVE'; end if;
       update party_extras.duo_matches set
         confirmed_a=confirmed_a or player_a=p_player_key, confirmed_b=confirmed_b or player_b=p_player_key,
         status=case when (confirmed_a or player_a=p_player_key) and (confirmed_b or player_b=p_player_key) then 'completed' else 'active' end where id=v_id;
     else
       if exists(select 1 from party_extras.duo_matches where status='active' and p_player_key in (player_a,player_b)) then return jsonb_build_object('ok',true); end if;
       if (select count(*) from party_extras.duo_matches where p_player_key in (player_a,player_b))>=3 then raise exception 'DUO_LIMIT'; end if;
       -- Joining again refreshes an existing wait without creating a second ticket.
       insert into party_extras.duo_queue(player_key,player_name) values(p_player_key,v_name) on conflict(player_key) do update set player_name=excluded.player_name;
       select q.* into v_other from party_extras.duo_queue q
       where q.player_key<>p_player_key
         and public.live_vote_player_name(q.player_key) is not null
         and exists(select 1 from public.party_identity_sessions s where s.player_key=q.player_key)
         and not exists(select 1 from party_extras.duo_matches d where d.status='active' and q.player_key in (d.player_a,d.player_b))
         and (select count(*) from party_extras.duo_matches d where q.player_key in (d.player_a,d.player_b))<3
         and not exists(select 1 from party_extras.duo_matches d where p_player_key in (d.player_a,d.player_b) and q.player_key in (d.player_a,d.player_b))
       order by q.joined_at,random() limit 1;
       if found then
         select prompt into v_prompt from party_extras.duo_prompts order by random() limit 1;
         insert into party_extras.duo_matches(player_a,player_b,name_a,name_b,prompt) values(p_player_key,v_other.player_key,v_name,v_other.player_name,v_prompt);
         delete from party_extras.duo_queue where player_key in (p_player_key,v_other.player_key);
       end if;
     end if;
   end if;
 else raise exception 'INVALID_ACTION';
 end if;
 return jsonb_build_object('ok',true);
end;
$$;
revoke all on function party_extras.act(text,jsonb,text,uuid) from public;
grant execute on function party_extras.act(text,jsonb,text,uuid) to anon,authenticated;
create function public.party_extras_action(p_action text,p_payload jsonb default '{}',p_player_key text default null,p_session_token uuid default null)
returns jsonb language sql security invoker set search_path='' as $$ select party_extras.act(p_action,p_payload,p_player_key,p_session_token); $$;
revoke all on function public.party_extras_action(text,jsonb,text,uuid) from public;
grant execute on function public.party_extras_action(text,jsonb,text,uuid) to anon,authenticated;

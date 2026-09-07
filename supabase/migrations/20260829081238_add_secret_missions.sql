alter table public.party_state
  add column if not exists missions_visible boolean not null default true;

alter table public.party_state
  drop constraint if exists party_state_featured_module_check;

alter table public.party_state
  add constraint party_state_featured_module_check
  check (
    featured_module is null
    or featured_module = any (
      array['iceberg'::text, 'beer-pong'::text, 'bingo'::text, 'guests'::text, 'missions'::text]
    )
  );

create table if not exists public.secret_mission_prompts (
  id uuid primary key default gen_random_uuid(),
  text text not null check (char_length(trim(text)) > 0),
  difficulty text not null default 'medium'
    check (difficulty in ('easy', 'medium', 'hard')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (text)
);

create table if not exists public.secret_mission_players (
  id uuid primary key default gen_random_uuid(),
  player_key text not null unique
    check (player_key like 'guest:%' or player_key like 'plus:%'),
  player_name text not null check (char_length(trim(player_name)) > 0),
  session_token uuid not null,
  current_prompt_id uuid references public.secret_mission_prompts(id) on delete set null,
  completed_count integer not null default 0 check (completed_count >= 0),
  skips_used integer not null default 0 check (skips_used between 0 and 1),
  assigned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.secret_mission_history (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.secret_mission_players(id) on delete cascade,
  prompt_id uuid references public.secret_mission_prompts(id) on delete set null,
  prompt_text text not null,
  outcome text not null check (outcome in ('completed', 'skipped')),
  created_at timestamptz not null default now()
);

create table if not exists public.secret_mission_scoreboard (
  player_id uuid primary key references public.secret_mission_players(id) on delete cascade,
  player_name text not null,
  completed_count integer not null default 0 check (completed_count >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists secret_mission_history_player_id_idx
  on public.secret_mission_history(player_id, created_at desc);

create index if not exists secret_mission_prompts_active_idx
  on public.secret_mission_prompts(is_active, difficulty, sort_order);

alter table public.secret_mission_prompts enable row level security;
alter table public.secret_mission_players enable row level security;
alter table public.secret_mission_history enable row level security;
alter table public.secret_mission_scoreboard enable row level security;

drop policy if exists "Admins can read mission prompts" on public.secret_mission_prompts;
create policy "Admins can read mission prompts"
on public.secret_mission_prompts
for select
using (
  exists (
    select 1 from public.app_admins
    where app_admins.user_id = (select auth.uid())
  )
);

drop policy if exists "Admins can insert mission prompts" on public.secret_mission_prompts;
create policy "Admins can insert mission prompts"
on public.secret_mission_prompts
for insert
with check (
  exists (
    select 1 from public.app_admins
    where app_admins.user_id = (select auth.uid())
  )
);

drop policy if exists "Admins can update mission prompts" on public.secret_mission_prompts;
create policy "Admins can update mission prompts"
on public.secret_mission_prompts
for update
using (
  exists (
    select 1 from public.app_admins
    where app_admins.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.app_admins
    where app_admins.user_id = (select auth.uid())
  )
);

drop policy if exists "Admins can delete mission prompts" on public.secret_mission_prompts;
create policy "Admins can delete mission prompts"
on public.secret_mission_prompts
for delete
using (
  exists (
    select 1 from public.app_admins
    where app_admins.user_id = (select auth.uid())
  )
);

drop policy if exists "Admins can read mission players" on public.secret_mission_players;
create policy "Admins can read mission players"
on public.secret_mission_players
for select
using (
  exists (
    select 1 from public.app_admins
    where app_admins.user_id = (select auth.uid())
  )
);

drop policy if exists "Admins can delete mission players" on public.secret_mission_players;
create policy "Admins can delete mission players"
on public.secret_mission_players
for delete
using (
  exists (
    select 1 from public.app_admins
    where app_admins.user_id = (select auth.uid())
  )
);

drop policy if exists "Admins can read mission history" on public.secret_mission_history;
create policy "Admins can read mission history"
on public.secret_mission_history
for select
using (
  exists (
    select 1 from public.app_admins
    where app_admins.user_id = (select auth.uid())
  )
);

drop policy if exists "Public can read mission scoreboard" on public.secret_mission_scoreboard;
create policy "Public can read mission scoreboard"
on public.secret_mission_scoreboard
for select
using (true);

create or replace function public.private_secret_mission_player_name(p_player_key text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
begin
  begin
    if p_player_key like 'guest:%' then
      v_id := substring(p_player_key from 7)::uuid;

      select g.name
      into v_name
      from public.guests g
      where g.id = v_id
        and g.status = 'confirmed';

      return v_name;
    end if;

    if p_player_key like 'plus:%' then
      v_id := substring(p_player_key from 6)::uuid;

      select po.name
      into v_name
      from public.plus_ones po
      join public.guests g on g.id = po.guest_id
      where po.id = v_id
        and g.status = 'confirmed';

      return v_name;
    end if;
  exception
    when invalid_text_representation then
      return null;
  end;

  return null;
end;
$$;

create or replace function public.private_assign_secret_mission(p_player_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prompt_id uuid;
begin
  select p.id
  into v_prompt_id
  from public.secret_mission_prompts p
  where p.is_active = true
    and not exists (
      select 1
      from public.secret_mission_history h
      where h.player_id = p_player_id
        and h.prompt_id = p.id
    )
  order by random()
  limit 1;

  if v_prompt_id is null then
    select p.id
    into v_prompt_id
    from public.secret_mission_prompts p
    where p.is_active = true
    order by random()
    limit 1;
  end if;

  update public.secret_mission_players
  set current_prompt_id = v_prompt_id,
      assigned_at = case when v_prompt_id is null then null else now() end,
      updated_at = now()
  where id = p_player_id;

  return v_prompt_id;
end;
$$;

create or replace function public.private_secret_mission_payload(p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.secret_mission_players%rowtype;
  v_prompt public.secret_mission_prompts%rowtype;
begin
  select * into v_player
  from public.secret_mission_players
  where id = p_player_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'PLAYER_NOT_FOUND');
  end if;

  if v_player.current_prompt_id is not null then
    select * into v_prompt
    from public.secret_mission_prompts
    where id = v_player.current_prompt_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'playerKey', v_player.player_key,
    'playerName', v_player.player_name,
    'completedCount', v_player.completed_count,
    'skipsRemaining', greatest(0, 1 - v_player.skips_used),
    'mission', case
      when v_prompt.id is null then null
      else jsonb_build_object(
        'id', v_prompt.id,
        'text', v_prompt.text,
        'difficulty', v_prompt.difficulty,
        'assignedAt', v_player.assigned_at
      )
    end
  );
end;
$$;

create or replace function public.claim_secret_mission(
  p_player_key text,
  p_session_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_player public.secret_mission_players%rowtype;
begin
  if p_session_token is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SESSION');
  end if;

  v_name := public.private_secret_mission_player_name(p_player_key);

  if v_name is null then
    return jsonb_build_object('ok', false, 'code', 'PLAYER_NOT_AVAILABLE');
  end if;

  select * into v_player
  from public.secret_mission_players
  where player_key = p_player_key
  for update;

  if found then
    if v_player.session_token <> p_session_token then
      return jsonb_build_object('ok', false, 'code', 'IDENTITY_ALREADY_CLAIMED');
    end if;

    update public.secret_mission_players
    set player_name = v_name,
        updated_at = now()
    where id = v_player.id;
  else
    insert into public.secret_mission_players (
      player_key,
      player_name,
      session_token
    )
    values (
      p_player_key,
      v_name,
      p_session_token
    )
    returning * into v_player;
  end if;

  select * into v_player
  from public.secret_mission_players
  where player_key = p_player_key
  for update;

  if v_player.current_prompt_id is null then
    perform public.private_assign_secret_mission(v_player.id);
  end if;

  insert into public.secret_mission_scoreboard (
    player_id,
    player_name,
    completed_count,
    updated_at
  )
  values (
    v_player.id,
    v_name,
    v_player.completed_count,
    now()
  )
  on conflict (player_id)
  do update set
    player_name = excluded.player_name,
    completed_count = excluded.completed_count,
    updated_at = excluded.updated_at;

  return public.private_secret_mission_payload(v_player.id);
end;
$$;

create or replace function public.get_secret_mission_state(
  p_player_key text,
  p_session_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.secret_mission_players%rowtype;
  v_name text;
begin
  v_name := public.private_secret_mission_player_name(p_player_key);

  if v_name is null then
    return jsonb_build_object('ok', false, 'code', 'PLAYER_NOT_AVAILABLE');
  end if;

  select * into v_player
  from public.secret_mission_players
  where player_key = p_player_key
  for update;

  if not found or v_player.session_token <> p_session_token then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SESSION');
  end if;

  update public.secret_mission_players
  set player_name = v_name,
      updated_at = now()
  where id = v_player.id;

  if v_player.current_prompt_id is null then
    perform public.private_assign_secret_mission(v_player.id);
  end if;

  update public.secret_mission_scoreboard
  set player_name = v_name,
      completed_count = v_player.completed_count,
      updated_at = now()
  where player_id = v_player.id;

  return public.private_secret_mission_payload(v_player.id);
end;
$$;

create or replace function public.complete_secret_mission(
  p_player_key text,
  p_session_token uuid,
  p_mission_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.secret_mission_players%rowtype;
  v_prompt public.secret_mission_prompts%rowtype;
  v_result jsonb;
begin
  select * into v_player
  from public.secret_mission_players
  where player_key = p_player_key
  for update;

  if not found or v_player.session_token <> p_session_token then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SESSION');
  end if;

  if v_player.current_prompt_id is null
     or v_player.current_prompt_id <> p_mission_id then
    return jsonb_build_object('ok', false, 'code', 'STALE_MISSION');
  end if;

  select * into v_prompt
  from public.secret_mission_prompts
  where id = v_player.current_prompt_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'MISSION_NOT_FOUND');
  end if;

  insert into public.secret_mission_history (
    player_id,
    prompt_id,
    prompt_text,
    outcome
  )
  values (
    v_player.id,
    v_prompt.id,
    v_prompt.text,
    'completed'
  );

  update public.secret_mission_players
  set completed_count = completed_count + 1,
      current_prompt_id = null,
      assigned_at = null,
      updated_at = now()
  where id = v_player.id;

  perform public.private_assign_secret_mission(v_player.id);

  select * into v_player
  from public.secret_mission_players
  where id = v_player.id;

  insert into public.secret_mission_scoreboard (
    player_id,
    player_name,
    completed_count,
    updated_at
  )
  values (
    v_player.id,
    v_player.player_name,
    v_player.completed_count,
    now()
  )
  on conflict (player_id)
  do update set
    player_name = excluded.player_name,
    completed_count = excluded.completed_count,
    updated_at = excluded.updated_at;

  v_result := public.private_secret_mission_payload(v_player.id);

  return v_result || jsonb_build_object(
    'justCompleted', true,
    'completedText', v_prompt.text
  );
end;
$$;

create or replace function public.skip_secret_mission(
  p_player_key text,
  p_session_token uuid,
  p_mission_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.secret_mission_players%rowtype;
  v_prompt public.secret_mission_prompts%rowtype;
  v_result jsonb;
begin
  select * into v_player
  from public.secret_mission_players
  where player_key = p_player_key
  for update;

  if not found or v_player.session_token <> p_session_token then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SESSION');
  end if;

  if v_player.skips_used >= 1 then
    return jsonb_build_object('ok', false, 'code', 'NO_SKIP_LEFT');
  end if;

  if v_player.current_prompt_id is null
     or v_player.current_prompt_id <> p_mission_id then
    return jsonb_build_object('ok', false, 'code', 'STALE_MISSION');
  end if;

  select * into v_prompt
  from public.secret_mission_prompts
  where id = v_player.current_prompt_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'MISSION_NOT_FOUND');
  end if;

  insert into public.secret_mission_history (
    player_id,
    prompt_id,
    prompt_text,
    outcome
  )
  values (
    v_player.id,
    v_prompt.id,
    v_prompt.text,
    'skipped'
  );

  update public.secret_mission_players
  set skips_used = skips_used + 1,
      current_prompt_id = null,
      assigned_at = null,
      updated_at = now()
  where id = v_player.id;

  perform public.private_assign_secret_mission(v_player.id);

  select * into v_player
  from public.secret_mission_players
  where id = v_player.id;

  v_result := public.private_secret_mission_payload(v_player.id);

  return v_result || jsonb_build_object('justSkipped', true);
end;
$$;

revoke all on function public.private_secret_mission_player_name(text) from public, anon, authenticated;
revoke all on function public.private_assign_secret_mission(uuid) from public, anon, authenticated;
revoke all on function public.private_secret_mission_payload(uuid) from public, anon, authenticated;

grant execute on function public.claim_secret_mission(text, uuid) to anon, authenticated;
grant execute on function public.get_secret_mission_state(text, uuid) to anon, authenticated;
grant execute on function public.complete_secret_mission(text, uuid, uuid) to anon, authenticated;
grant execute on function public.skip_secret_mission(text, uuid, uuid) to anon, authenticated;

grant select on public.secret_mission_scoreboard to anon, authenticated;
grant select, insert, update, delete on public.secret_mission_prompts to authenticated;
grant select, delete on public.secret_mission_players to authenticated;
grant select on public.secret_mission_history to authenticated;

insert into public.secret_mission_prompts (text, difficulty, sort_order, is_active)
values
('Place le mot « pingouin » dans une conversation sans que ça paraisse forcé.', 'easy', 10, true),
('Obtiens un high-five de trois personnes différentes.', 'easy', 20, true),
('Fais dire « c’est pas faux » à quelqu’un.', 'easy', 30, true),
('Fais rire quelqu’un sans raconter de blague.', 'easy', 40, true),
('Obtiens une photo où trois personnes font exactement la même pose.', 'easy', 50, true),
('Fais prononcer le mot « anniversaire » à quelqu’un sans le dire toi-même.', 'easy', 60, true),
('Fais changer quelqu’un de place sans lui demander directement de bouger.', 'easy', 70, true),
('Reçois un compliment sans en réclamer un.', 'easy', 80, true),
('Fais trinquer deux personnes qui ne discutaient pas ensemble.', 'easy', 90, true),
('Amène quelqu’un à raconter son dernier film ou sa dernière série.', 'easy', 100, true),
('Fais apparaître spontanément un deuxième téléphone sur une photo.', 'easy', 110, true),
('Obtiens trois poignées de main en moins de cinq minutes.', 'easy', 120, true),
('Convaincs quelqu’un pendant au moins trente secondes que tu as déjà rencontré une célébrité.', 'medium', 130, true),
('Place trois titres de films dans une même conversation sans être grillé.', 'medium', 140, true),
('Fais lancer une chanson de ton choix par quelqu’un d’autre sans lui dire que c’est une mission.', 'medium', 150, true),
('Amène deux personnes qui se connaissent peu à discuter ensemble.', 'medium', 160, true),
('Fais raconter à quelqu’un une anecdote de lycée devant au moins trois personnes.', 'medium', 170, true),
('Obtiens une photo de groupe avec au moins cinq personnes sans prendre toi-même la photo.', 'medium', 180, true),
('Fais dire « on est vraiment vieux » à quelqu’un.', 'medium', 190, true),
('Fais commencer une discussion sur un voyage sans prononcer le mot « voyage ».', 'medium', 200, true),
('Fais choisir entre deux options absurdes à au moins trois personnes.', 'medium', 210, true),
('Fais qu’une personne te présente à une autre alors que vous vous connaissez déjà.', 'medium', 220, true),
('Fais apparaître un objet totalement banal au centre d’une discussion pendant une minute.', 'medium', 230, true),
('Fais reprendre une de tes expressions par quelqu’un dans la soirée.', 'medium', 240, true),
('Fais démarrer un mini-applaudissement sans annoncer pourquoi.', 'hard', 250, true),
('Fais croire pendant une minute qu’une tradition familiale complètement absurde existe chez toi.', 'hard', 260, true),
('Fais en sorte qu’au moins quatre personnes regardent simultanément dans la même direction.', 'hard', 270, true),
('Fais raconter la même anecdote par deux personnes différentes sans leur révéler ton objectif.', 'hard', 280, true),
('Fais naître un débat sérieux à partir d’un sujet parfaitement ridicule.', 'hard', 290, true),
('Fais qu’un groupe d’au moins quatre personnes adopte la même pose pour une photo sans prononcer le mot « pose ».', 'hard', 300, true),
('Fais que quelqu’un ouvre l’Iceberg de lui-même pendant votre conversation.', 'hard', 310, true),
('Fais qu’une personne te demande spontanément « pourquoi ? ».', 'hard', 320, true),
('Fais citer trois pays différents par trois personnes différentes en moins de cinq minutes.', 'hard', 330, true),
('Fais lancer un vote improvisé sur une question inutile et obtiens au moins quatre réponses.', 'hard', 340, true),
('Fais qu’une personne raconte volontairement une anecdote gênante sur elle-même.', 'hard', 350, true),
('Fais qu’au moins trois personnes répètent le même mot dans la même conversation.', 'hard', 360, true)
on conflict (text) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'secret_mission_scoreboard'
  ) then
    alter publication supabase_realtime add table public.secret_mission_scoreboard;
  end if;
end $$;

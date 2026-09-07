create table if not exists public.party_identity_sessions (
  player_key text primary key check (player_key like 'guest:%' or player_key like 'plus:%'),
  player_name text not null check (char_length(trim(player_name)) > 0),
  session_token uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.party_identity_sessions enable row level security;

revoke all on table public.party_identity_sessions from anon, authenticated;
grant select on table public.party_identity_sessions to authenticated;

drop policy if exists "Admins can read party identities" on public.party_identity_sessions;
create policy "Admins can read party identities"
on public.party_identity_sessions
for select
to authenticated
using (
  exists (
    select 1
    from public.app_admins
    where app_admins.user_id = (select auth.uid())
  )
);

create or replace function public.claim_party_identity(
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
  v_existing public.party_identity_sessions%rowtype;
  v_token_owner public.party_identity_sessions%rowtype;
begin
  if p_session_token is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SESSION');
  end if;

  v_name := public.live_vote_player_name(p_player_key);

  if v_name is null then
    return jsonb_build_object('ok', false, 'code', 'PLAYER_NOT_AVAILABLE');
  end if;

  select * into v_existing
  from public.party_identity_sessions
  where player_key = p_player_key
  for update;

  if found then
    if v_existing.session_token <> p_session_token then
      return jsonb_build_object('ok', false, 'code', 'IDENTITY_ALREADY_CLAIMED');
    end if;

    update public.party_identity_sessions
    set player_name = v_name,
        updated_at = now(),
        last_seen_at = now()
    where player_key = p_player_key;

    return jsonb_build_object(
      'ok', true,
      'playerKey', p_player_key,
      'playerName', v_name
    );
  end if;

  select * into v_token_owner
  from public.party_identity_sessions
  where session_token = p_session_token;

  if found then
    return jsonb_build_object('ok', false, 'code', 'DEVICE_ALREADY_LINKED');
  end if;

  insert into public.party_identity_sessions (
    player_key,
    player_name,
    session_token
  ) values (
    p_player_key,
    v_name,
    p_session_token
  );

  return jsonb_build_object(
    'ok', true,
    'playerKey', p_player_key,
    'playerName', v_name
  );
end;
$$;

create or replace function public.release_party_identity(
  p_player_key text,
  p_session_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.party_identity_sessions%rowtype;
begin
  select * into v_existing
  from public.party_identity_sessions
  where player_key = p_player_key
  for update;

  if not found then
    return jsonb_build_object('ok', true, 'released', false);
  end if;

  if v_existing.session_token <> p_session_token then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SESSION');
  end if;

  delete from public.party_identity_sessions
  where player_key = p_player_key
    and session_token = p_session_token;

  return jsonb_build_object('ok', true, 'released', true);
end;
$$;

create or replace function public.claim_live_vote_identity(
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
  v_existing public.live_vote_players%rowtype;
  v_token_owner public.live_vote_players%rowtype;
  v_global_token uuid;
  v_has_global boolean := false;
begin
  if p_session_token is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SESSION');
  end if;

  v_name := public.live_vote_player_name(p_player_key);

  if v_name is null then
    return jsonb_build_object('ok', false, 'code', 'PLAYER_NOT_AVAILABLE');
  end if;

  select session_token into v_global_token
  from public.party_identity_sessions
  where player_key = p_player_key;
  v_has_global := found;

  if v_has_global and v_global_token <> p_session_token then
    return jsonb_build_object('ok', false, 'code', 'IDENTITY_ALREADY_CLAIMED');
  end if;

  select * into v_existing
  from public.live_vote_players
  where player_key = p_player_key
  for update;

  if found then
    if v_existing.session_token <> p_session_token then
      if not v_has_global then
        return jsonb_build_object('ok', false, 'code', 'IDENTITY_ALREADY_CLAIMED');
      end if;

      select * into v_token_owner
      from public.live_vote_players
      where session_token = p_session_token
        and player_key <> p_player_key;

      if found then
        return jsonb_build_object('ok', false, 'code', 'DEVICE_ALREADY_LINKED');
      end if;

      update public.live_vote_players
      set session_token = p_session_token
      where player_key = p_player_key;
    end if;

    update public.live_vote_players
    set player_name = v_name,
        last_seen_at = now()
    where player_key = p_player_key;

    return jsonb_build_object(
      'ok', true,
      'playerKey', p_player_key,
      'playerName', v_name,
      'score', v_existing.score
    );
  end if;

  select * into v_token_owner
  from public.live_vote_players
  where session_token = p_session_token;

  if found then
    return jsonb_build_object('ok', false, 'code', 'DEVICE_ALREADY_LINKED');
  end if;

  insert into public.live_vote_players (
    player_key,
    player_name,
    session_token
  ) values (
    p_player_key,
    v_name,
    p_session_token
  );

  return jsonb_build_object(
    'ok', true,
    'playerKey', p_player_key,
    'playerName', v_name,
    'score', 0
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
  v_global_token uuid;
  v_has_global boolean := false;
begin
  if p_session_token is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SESSION');
  end if;

  v_name := public.private_secret_mission_player_name(p_player_key);

  if v_name is null then
    return jsonb_build_object('ok', false, 'code', 'PLAYER_NOT_AVAILABLE');
  end if;

  select session_token into v_global_token
  from public.party_identity_sessions
  where player_key = p_player_key;
  v_has_global := found;

  if v_has_global and v_global_token <> p_session_token then
    return jsonb_build_object('ok', false, 'code', 'IDENTITY_ALREADY_CLAIMED');
  end if;

  select * into v_player
  from public.secret_mission_players
  where player_key = p_player_key
  for update;

  if found then
    if v_player.session_token <> p_session_token then
      if not v_has_global then
        return jsonb_build_object('ok', false, 'code', 'IDENTITY_ALREADY_CLAIMED');
      end if;

      update public.secret_mission_players
      set session_token = p_session_token
      where id = v_player.id;
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
    ) values (
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
  ) values (
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
begin
  return public.claim_secret_mission(p_player_key, p_session_token);
end;
$$;

revoke all on function public.claim_party_identity(text, uuid) from public;
revoke all on function public.release_party_identity(text, uuid) from public;
grant execute on function public.claim_party_identity(text, uuid) to anon, authenticated;
grant execute on function public.release_party_identity(text, uuid) to anon, authenticated;

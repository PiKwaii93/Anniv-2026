-- Two isolated data slots share the existing, battle-tested module RPCs.
-- Switching slots is transactional: the active data is snapshotted, the
-- target slot is restored, and clients are invalidated through data_epoch.
alter table public.party_state
  add column environment text not null default 'live'
  check (environment in ('live', 'rehearsal'));

create schema party_rehearsal;
revoke all on schema party_rehearsal from public, anon;
grant usage on schema party_rehearsal to authenticated;

create table party_rehearsal.slots (
  environment text primary key check (environment in ('live', 'rehearsal')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  saved_at timestamptz not null default clock_timestamp(),
  saved_by uuid references auth.users(id)
);

create table party_rehearsal.switches (
  id uuid primary key default gen_random_uuid(),
  source_environment text not null check (source_environment in ('live', 'rehearsal')),
  target_environment text not null check (target_environment in ('live', 'rehearsal')),
  switched_by uuid not null references auth.users(id),
  switched_at timestamptz not null default clock_timestamp()
);

alter table party_rehearsal.slots enable row level security;
alter table party_rehearsal.switches enable row level security;
revoke all on all tables in schema party_rehearsal from public, anon, authenticated;

create function party_rehearsal.capture_active() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'party_state', (
      select to_jsonb(s) - array['id', 'updated_at', 'data_epoch', 'environment']
      from public.party_state s where id = 'main'
    ),
    'beer_pong', (
      select to_jsonb(s) - array['id', 'updated_at']
      from public.beer_pong_state s where id = 'main'
    ),
    'room_control', (
      select to_jsonb(s) - array['id', 'updated_at']
      from public.live_vote_control s where id = 'main'
    ),
    'room_public', (
      select to_jsonb(s) - array['id', 'updated_at']
      from public.live_vote_public_state s where id = 'main'
    ),
    'announcement', (
      select to_jsonb(s) - array['id', 'updated_at']
      from public.party_announcements s where id = 'main'
    ),
    'room_players', coalesce((select jsonb_agg(to_jsonb(t)) from public.live_vote_players t), '[]'::jsonb),
    'room_rounds', coalesce((select jsonb_agg(to_jsonb(t)) from public.live_vote_rounds t), '[]'::jsonb),
    'room_votes', coalesce((select jsonb_agg(to_jsonb(t)) from public.live_vote_votes t), '[]'::jsonb),
    'mission_players', coalesce((select jsonb_agg(to_jsonb(t)) from public.secret_mission_players t), '[]'::jsonb),
    'mission_history', coalesce((select jsonb_agg(to_jsonb(t)) from public.secret_mission_history t), '[]'::jsonb),
    'mission_scoreboard', coalesce((select jsonb_agg(to_jsonb(t)) from public.secret_mission_scoreboard t), '[]'::jsonb),
    'mission_validations', coalesce((select jsonb_agg(to_jsonb(t)) from party_missions.validations t), '[]'::jsonb),
    'photo_submissions', coalesce((select jsonb_agg(to_jsonb(t)) from public.photo_hunt_submissions t), '[]'::jsonb),
    'photo_slots', coalesce((select jsonb_agg(to_jsonb(t)) from public.photo_hunt_upload_slots t), '[]'::jsonb),
    'extras_settings', (
      select to_jsonb(s) - 'id' from party_extras.settings s where id
    ),
    'letters', coalesce((select jsonb_agg(to_jsonb(t)) from party_extras.letters t), '[]'::jsonb),
    'songs', coalesce((select jsonb_agg(to_jsonb(t)) from party_extras.songs t), '[]'::jsonb),
    'song_votes', coalesce((select jsonb_agg(to_jsonb(t)) from party_extras.votes t), '[]'::jsonb),
    'spotify_dispatches', coalesce((select jsonb_agg(to_jsonb(t)) from party_extras.spotify_dispatches t), '[]'::jsonb),
    'spotify_limits', coalesce((select jsonb_agg(to_jsonb(t)) from party_extras.spotify_guest_limits t), '[]'::jsonb),
    'duo_queue', coalesce((select jsonb_agg(to_jsonb(t)) from party_extras.duo_queue t), '[]'::jsonb),
    'duo_matches', coalesce((select jsonb_agg(to_jsonb(t)) from party_extras.duo_matches t), '[]'::jsonb),
    'chat_settings', (
      select to_jsonb(s) - 'id' from party_chat.settings s where id
    ),
    'chat_messages', coalesce((select jsonb_agg(to_jsonb(t)) from party_chat.messages t), '[]'::jsonb),
    'chat_reads', coalesce((select jsonb_agg(to_jsonb(t)) from party_chat.reads t), '[]'::jsonb),
    'bring_items', coalesce((select jsonb_agg(to_jsonb(t)) from party_bring.items t), '[]'::jsonb)
  );
$$;

create function party_rehearsal.empty_slot() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare payload jsonb;
begin
  payload := party_rehearsal.capture_active();
  return payload || jsonb_build_object(
    'party_state', (payload -> 'party_state') || jsonb_build_object('phase', 'preparation', 'featured_module', null),
    'beer_pong', jsonb_build_object('state', jsonb_build_object(
      'selectedPlayerIds', '[]'::jsonb,
      'playerSnapshots', '[]'::jsonb,
      'teams', '[]'::jsonb,
      'draftMode', 'random',
      'draftValidated', false,
      'rounds', '[]'::jsonb,
      'championTeamId', null
    )),
    'room_control', jsonb_build_object('current_round_id', null),
    'room_public', jsonb_build_object('state', jsonb_build_object('phase', 'idle', 'roundId', null)),
    'announcement', jsonb_build_object(
      'message', '', 'kind', 'info', 'is_active', false,
      'expires_at', null, 'event_id', gen_random_uuid()
    ),
    'room_players', '[]'::jsonb,
    'room_rounds', '[]'::jsonb,
    'room_votes', '[]'::jsonb,
    'mission_players', '[]'::jsonb,
    'mission_history', '[]'::jsonb,
    'mission_scoreboard', '[]'::jsonb,
    'mission_validations', '[]'::jsonb,
    'photo_submissions', '[]'::jsonb,
    'photo_slots', '[]'::jsonb,
    'letters', '[]'::jsonb,
    'songs', '[]'::jsonb,
    'song_votes', '[]'::jsonb,
    'spotify_dispatches', '[]'::jsonb,
    'spotify_limits', '[]'::jsonb,
    'duo_queue', '[]'::jsonb,
    'duo_matches', '[]'::jsonb,
    'chat_messages', '[]'::jsonb,
    'chat_reads', '[]'::jsonb,
    'bring_items', '[]'::jsonb
  );
end;
$$;

create function party_rehearsal.restore_slot(payload jsonb, target_environment text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  party_cfg public.party_state%rowtype;
  extras_cfg party_extras.settings%rowtype;
  chat_cfg party_chat.settings%rowtype;
  beer_cfg public.beer_pong_state%rowtype;
  room_public_cfg public.live_vote_public_state%rowtype;
  announcement_cfg public.party_announcements%rowtype;
  target_round uuid;
begin
  if target_environment not in ('live', 'rehearsal') or jsonb_typeof(payload) is distinct from 'object' then
    raise exception 'INVALID_REHEARSAL_SLOT';
  end if;

  select * into party_cfg from jsonb_populate_record(null::public.party_state, payload -> 'party_state');
  select * into extras_cfg from jsonb_populate_record(null::party_extras.settings, payload -> 'extras_settings');
  select * into chat_cfg from jsonb_populate_record(null::party_chat.settings, payload -> 'chat_settings');
  select * into beer_cfg from jsonb_populate_record(null::public.beer_pong_state, payload -> 'beer_pong');
  select * into room_public_cfg from jsonb_populate_record(null::public.live_vote_public_state, payload -> 'room_public');
  select * into announcement_cfg from jsonb_populate_record(null::public.party_announcements, payload -> 'announcement');
  target_round := nullif(payload #>> '{room_control,current_round_id}', '')::uuid;

  update public.live_vote_control set current_round_id = null, updated_at = clock_timestamp() where id = 'main';
  delete from public.live_vote_votes where id is not null;
  delete from public.live_vote_rounds where id is not null;
  delete from public.live_vote_players where player_key is not null;

  delete from party_missions.validations where id is not null;
  delete from public.secret_mission_history where id is not null;
  delete from public.secret_mission_scoreboard where player_id is not null;
  delete from public.secret_mission_players where id is not null;

  delete from party_extras.votes where song_id is not null;
  delete from party_extras.spotify_dispatches where song_id is not null;
  delete from party_extras.songs where id is not null;
  delete from party_extras.spotify_guest_limits where player_key is not null;
  delete from party_extras.letters where player_key is not null;
  delete from party_extras.duo_queue where player_key is not null;
  delete from party_extras.duo_matches where id is not null;

  delete from party_chat.reads where player_key is not null;
  delete from party_chat.messages where id is not null;
  delete from party_bring.items where id is not null;
  delete from public.photo_hunt_upload_slots where id is not null;
  delete from public.photo_hunt_submissions where id is not null;
  delete from public.party_identity_sessions where player_key is not null;

  update public.beer_pong_state
    set state = coalesce(beer_cfg.state, '{}'::jsonb), updated_at = clock_timestamp()
    where id = 'main';
  update public.live_vote_public_state
    set state = coalesce(room_public_cfg.state, '{"phase":"idle","roundId":null}'::jsonb), updated_at = clock_timestamp()
    where id = 'main';
  update public.party_announcements
    set message = coalesce(announcement_cfg.message, ''),
        kind = coalesce(announcement_cfg.kind, 'info'),
        is_active = false,
        expires_at = null,
        event_id = gen_random_uuid(),
        updated_at = clock_timestamp()
    where id = 'main';
  update party_extras.settings
    set capsule_visible = coalesce(extras_cfg.capsule_visible, true),
        capsule_open = coalesce(extras_cfg.capsule_open, true),
        capsule_reveal_at = coalesce(extras_cfg.capsule_reveal_at, '2026-10-25 11:00:00+00'::timestamptz),
        jukebox_visible = coalesce(extras_cfg.jukebox_visible, true),
        jukebox_open = coalesce(extras_cfg.jukebox_open, true),
        duos_visible = coalesce(extras_cfg.duos_visible, true),
        duos_open = coalesce(extras_cfg.duos_open, true),
        credits_enabled = coalesce(extras_cfg.credits_enabled, true),
        credits_run = coalesce(extras_cfg.credits_run, gen_random_uuid())
    where id;
  update party_chat.settings set open = coalesce(chat_cfg.open, true) where id;

  -- Update the public state before restoring Bring: its existing epoch trigger
  -- clears the active list, so restored items must be inserted afterwards.
  update public.party_state
    set phase = coalesce(party_cfg.phase, 'preparation'),
        featured_module = party_cfg.featured_module,
        iceberg_visible = coalesce(party_cfg.iceberg_visible, true),
        beer_pong_visible = coalesce(party_cfg.beer_pong_visible, true),
        bingo_visible = coalesce(party_cfg.bingo_visible, true),
        missions_visible = coalesce(party_cfg.missions_visible, true),
        room_visible = coalesce(party_cfg.room_visible, true),
        photos_visible = coalesce(party_cfg.photos_visible, true),
        guests_visible = coalesce(party_cfg.guests_visible, true),
        environment = target_environment,
        data_epoch = data_epoch + 1,
        updated_at = clock_timestamp()
    where id = 'main';

  insert into public.live_vote_players
    select * from jsonb_populate_recordset(null::public.live_vote_players, coalesce(payload -> 'room_players', '[]'::jsonb));
  insert into public.live_vote_rounds
    select * from jsonb_populate_recordset(null::public.live_vote_rounds, coalesce(payload -> 'room_rounds', '[]'::jsonb));
  insert into public.live_vote_votes
    select * from jsonb_populate_recordset(null::public.live_vote_votes, coalesce(payload -> 'room_votes', '[]'::jsonb));
  update public.live_vote_control set current_round_id = target_round, updated_at = clock_timestamp() where id = 'main';

  insert into public.secret_mission_players
    select * from jsonb_populate_recordset(null::public.secret_mission_players, coalesce(payload -> 'mission_players', '[]'::jsonb));
  insert into public.secret_mission_history
    select * from jsonb_populate_recordset(null::public.secret_mission_history, coalesce(payload -> 'mission_history', '[]'::jsonb));
  insert into public.secret_mission_scoreboard
    select * from jsonb_populate_recordset(null::public.secret_mission_scoreboard, coalesce(payload -> 'mission_scoreboard', '[]'::jsonb));
  insert into party_missions.validations
    select * from jsonb_populate_recordset(null::party_missions.validations, coalesce(payload -> 'mission_validations', '[]'::jsonb));

  insert into public.photo_hunt_submissions
    select * from jsonb_populate_recordset(null::public.photo_hunt_submissions, coalesce(payload -> 'photo_submissions', '[]'::jsonb));
  insert into public.photo_hunt_upload_slots
    select * from jsonb_populate_recordset(null::public.photo_hunt_upload_slots, coalesce(payload -> 'photo_slots', '[]'::jsonb));

  insert into party_extras.letters
    select * from jsonb_populate_recordset(null::party_extras.letters, coalesce(payload -> 'letters', '[]'::jsonb));
  insert into party_extras.songs
    select * from jsonb_populate_recordset(null::party_extras.songs, coalesce(payload -> 'songs', '[]'::jsonb));
  insert into party_extras.votes
    select * from jsonb_populate_recordset(null::party_extras.votes, coalesce(payload -> 'song_votes', '[]'::jsonb));
  insert into party_extras.spotify_dispatches
    select * from jsonb_populate_recordset(null::party_extras.spotify_dispatches, coalesce(payload -> 'spotify_dispatches', '[]'::jsonb));
  insert into party_extras.spotify_guest_limits
    select * from jsonb_populate_recordset(null::party_extras.spotify_guest_limits, coalesce(payload -> 'spotify_limits', '[]'::jsonb));
  insert into party_extras.duo_queue
    select * from jsonb_populate_recordset(null::party_extras.duo_queue, coalesce(payload -> 'duo_queue', '[]'::jsonb));
  insert into party_extras.duo_matches
    select * from jsonb_populate_recordset(null::party_extras.duo_matches, coalesce(payload -> 'duo_matches', '[]'::jsonb));

  insert into party_chat.messages overriding system value
    select * from jsonb_populate_recordset(null::party_chat.messages, coalesce(payload -> 'chat_messages', '[]'::jsonb));
  insert into party_chat.reads
    select * from jsonb_populate_recordset(null::party_chat.reads, coalesce(payload -> 'chat_reads', '[]'::jsonb));
  insert into party_bring.items
    select * from jsonb_populate_recordset(null::party_bring.items, coalesce(payload -> 'bring_items', '[]'::jsonb));
end;
$$;

create function party_rehearsal.switch_environment(target_environment text, confirmation text) returns jsonb
language plpgsql security definer set search_path = '' set lock_timeout = '8s' as $$
declare
  source_environment text;
  source_payload jsonb;
  target_payload jsonb;
begin
  if not exists (select 1 from public.app_admins where user_id = (select auth.uid())) then
    raise exception 'NOT_ADMIN' using errcode = '42501';
  end if;
  if target_environment not in ('live', 'rehearsal') then raise exception 'INVALID_ENVIRONMENT'; end if;
  if confirmation is distinct from (case target_environment when 'rehearsal' then 'REPETITION' else 'SOIREE' end) then
    raise exception 'CONFIRMATION_REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(725260903203559::bigint);
  select environment into source_environment from public.party_state where id = 'main' for update;
  if source_environment is null then raise exception 'PARTY_STATE_MISSING'; end if;
  if source_environment = target_environment then
    return jsonb_build_object('ok', true, 'environment', source_environment, 'changed', false);
  end if;
  if (select phase from public.party_state where id = 'main') is distinct from 'preparation' then
    raise exception 'PREPARATION_REQUIRED';
  end if;
  if exists (select 1 from party_reset.photo_cleanup) then raise exception 'PHOTO_CLEANUP_PENDING'; end if;

  perform 1 from party_extras.settings where id for update;
  perform 1 from party_extras.spotify_connection where id for update;
  if exists (select 1 from party_extras.spotify_connection where id and lease_until > clock_timestamp()) then
    raise exception 'SPOTIFY_BUSY';
  end if;

  -- Invalidate every guest token before persisting the source slot. Admin auth
  -- is unaffected, and restored players can claim a fresh token later.
  perform party_identity.disconnect_all(true);
  source_payload := party_rehearsal.capture_active();
  insert into party_rehearsal.slots(environment, payload, saved_at, saved_by)
    values(source_environment, source_payload, clock_timestamp(), auth.uid())
    on conflict (environment) do update
      set payload = excluded.payload, saved_at = excluded.saved_at, saved_by = excluded.saved_by;

  select payload into target_payload from party_rehearsal.slots where environment = target_environment;
  if target_payload is null then target_payload := party_rehearsal.empty_slot(); end if;
  perform party_rehearsal.restore_slot(target_payload, target_environment);
  insert into party_rehearsal.switches(source_environment, target_environment, switched_by)
    values(source_environment, target_environment, auth.uid());

  return jsonb_build_object(
    'ok', true,
    'environment', target_environment,
    'changed', true,
    'source_saved_at', clock_timestamp()
  );
end;
$$;

revoke all on all functions in schema party_rehearsal from public, anon, authenticated;
grant execute on function party_rehearsal.switch_environment(text, text) to authenticated;

create function public.admin_switch_party_environment(
  p_environment text,
  p_confirmation text
) returns jsonb
language sql security invoker set search_path = '' as $$
  select party_rehearsal.switch_environment(p_environment, p_confirmation);
$$;
revoke all on function public.admin_switch_party_environment(text, text) from public, anon;
grant execute on function public.admin_switch_party_environment(text, text) to authenticated;

-- Storage objects belonging to the inactive slot must survive a reset of the
-- active slot. Only enqueue paths referenced by the active photo metadata.
create or replace function party_reset.reset(p_request uuid, p_confirmation text) returns jsonb
language plpgsql security definer set search_path = '' set lock_timeout = '5s' as $$
declare next_epoch bigint;
begin
  if not exists(select 1 from public.app_admins where user_id=(select auth.uid())) then
    raise exception 'NOT_ADMIN' using errcode='42501';
  end if;
  if p_request is null or p_confirmation is distinct from 'EFFACER' then raise exception 'CONFIRMATION_REQUIRED'; end if;
  perform pg_advisory_xact_lock(725260903203559);
  if exists(select 1 from party_reset.requests where id=p_request) then return party_reset.status(p_request); end if;
  if exists(select 1 from party_reset.photo_cleanup) then raise exception 'PHOTO_CLEANUP_PENDING'; end if;
  if (select phase from public.party_state where id='main') is distinct from 'preparation' then raise exception 'PREPARATION_REQUIRED'; end if;
  perform 1 from party_extras.settings where id for update;
  perform 1 from party_extras.spotify_connection where id for update;
  if exists(select 1 from party_extras.spotify_connection where id and lease_until>clock_timestamp()) then raise exception 'SPOTIFY_BUSY'; end if;

  perform party_identity.disconnect_all(true);
  update public.party_state set data_epoch=data_epoch+1, phase='preparation', featured_module=null,updated_at=clock_timestamp()
    where id='main' returning data_epoch into next_epoch;
  if next_epoch is null then raise exception 'PARTY_STATE_MISSING'; end if;
  insert into party_reset.requests(id,epoch,requested_by) values(p_request,next_epoch,auth.uid());
  insert into party_reset.photo_cleanup(request_id,path)
    select p_request,storage_path from public.photo_hunt_submissions
    union select p_request,storage_path from public.photo_hunt_upload_slots;

  delete from party_chat.reads where player_key is not null;
  delete from party_chat.messages where id is not null;
  delete from party_extras.votes where song_id is not null;
  delete from party_extras.spotify_dispatches where song_id is not null;
  delete from party_extras.songs where id is not null;
  delete from party_extras.spotify_guest_limits where player_key is not null;
  delete from party_extras.letters where player_key is not null;
  delete from party_extras.duo_queue where player_key is not null;
  delete from party_extras.duo_matches where id is not null;
  delete from public.photo_hunt_upload_slots where id is not null;
  delete from public.photo_hunt_submissions where id is not null;
  update public.live_vote_control set current_round_id=null,updated_at=clock_timestamp() where id='main';
  delete from public.live_vote_votes where id is not null;
  delete from public.live_vote_rounds where id is not null;
  delete from public.live_vote_players where player_key is not null;
  delete from party_missions.validations where id is not null;
  delete from public.secret_mission_history where id is not null;
  delete from public.secret_mission_scoreboard where player_id is not null;
  delete from public.secret_mission_players where id is not null;
  update public.live_vote_public_state set state='{"phase":"idle","roundId":null}'::jsonb,updated_at=clock_timestamp() where id='main';
  update public.beer_pong_state set state='{"selectedPlayerIds":[],"playerSnapshots":[],"teams":[],"draftMode":"random","draftValidated":false,"rounds":[],"championTeamId":null}'::jsonb,updated_at=clock_timestamp() where id='main';
  update public.party_announcements set message='',kind='info',is_active=false,expires_at=null,event_id=gen_random_uuid(),updated_at=clock_timestamp() where id='main';
  update party_extras.settings set credits_run=gen_random_uuid() where id;
  return party_reset.status(p_request);
end;
$$;

notify pgrst, 'reload schema';

-- Install only: this migration does not reset any party data.
-- The CLI is unavailable here; archive under the server-returned migration version.
alter table public.party_state add column data_epoch bigint not null default 0;

create schema party_reset;
revoke all on schema party_reset from public, anon;
grant usage on schema party_reset to authenticated;
create table party_reset.requests (
  id uuid primary key,
  epoch bigint not null unique,
  requested_by uuid not null,
  created_at timestamptz not null default clock_timestamp()
);
create table party_reset.photo_cleanup (
  request_id uuid not null references party_reset.requests(id),
  path text not null,
  primary key (request_id, path)
);
alter table party_reset.requests enable row level security;
alter table party_reset.photo_cleanup enable row level security;
revoke all on all tables in schema party_reset from public, anon, authenticated;

create function public.party_data_epoch() returns bigint
language sql stable security invoker set search_path='' as $$
  select data_epoch from public.party_state where id='main';
$$;
revoke all on function public.party_data_epoch() from public;
grant execute on function public.party_data_epoch() to anon, authenticated;

create function party_reset.status(p_request uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r party_reset.requests%rowtype; paths jsonb;
begin
  if not exists(select 1 from public.app_admins where user_id=(select auth.uid())) then
    raise exception 'NOT_ADMIN' using errcode='42501';
  end if;
  select * into r from party_reset.requests where p_request is null or id=p_request order by epoch desc limit 1;
  if not found then return jsonb_build_object('id',null,'pending',0,'paths','[]'::jsonb); end if;
  select coalesce(jsonb_agg(path order by path),'[]') into paths from (
    select path from party_reset.photo_cleanup where request_id=r.id order by path limit 100
  ) batch;
  return jsonb_build_object('id',r.id,'epoch',r.epoch,'created_at',r.created_at,'paths',paths,
    'pending',(select count(*) from party_reset.photo_cleanup where request_id=r.id));
end;
$$;

create function party_reset.reset(p_request uuid,p_confirmation text) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='5s' as $$
declare next_epoch bigint;
begin
  if not exists(select 1 from public.app_admins where user_id=(select auth.uid())) then
    raise exception 'NOT_ADMIN' using errcode='42501';
  end if;
  if p_request is null or p_confirmation is distinct from 'EFFACER' then raise exception 'CONFIRMATION_REQUIRED'; end if;
  -- The same lock as identity claims/disconnection. Retrying a committed UUID
  -- returns its receipt instead of deleting data created since that reset.
  perform pg_advisory_xact_lock(725260903203559);
  if exists(select 1 from party_reset.requests where id=p_request) then return party_reset.status(p_request); end if;
  if exists(select 1 from party_reset.photo_cleanup) then raise exception 'PHOTO_CLEANUP_PENDING'; end if;
  if (select phase from public.party_state where id='main') is distinct from 'preparation' then raise exception 'PREPARATION_REQUIRED'; end if;
  -- Follow the Spotify bridge's settings -> connection locking order. Never
  -- remove a dispatch while its external API call may still be in progress.
  perform 1 from party_extras.settings where id for update;
  perform 1 from party_extras.spotify_connection where id for update;
  if exists(select 1 from party_extras.spotify_connection where id and lease_until>clock_timestamp()) then raise exception 'SPOTIFY_BUSY'; end if;

  perform party_identity.disconnect_all(true);
  update public.party_state set data_epoch=data_epoch+1, phase='preparation', featured_module=null,updated_at=clock_timestamp()
    where id='main' returning data_epoch into next_epoch;
  if next_epoch is null then raise exception 'PARTY_STATE_MISSING'; end if;
  insert into party_reset.requests(id,epoch,requested_by) values(p_request,next_epoch,auth.uid());
  -- Record exact targets before removing submissions, including abandoned slots
  -- and orphans in this dedicated bucket. Storage bytes are removed via its API.
  insert into party_reset.photo_cleanup(request_id,path)
    select p_request,name from storage.objects where bucket_id='photo-hunt'
    union select p_request,storage_path from public.photo_hunt_submissions
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

create function party_reset.ack_photos(p_request uuid,p_paths text[]) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.app_admins where user_id=(select auth.uid())) then
    raise exception 'NOT_ADMIN' using errcode='42501';
  end if;
  if coalesce(cardinality(p_paths),0)>100 then raise exception 'BATCH_TOO_LARGE'; end if;
  -- A lying/stale client cannot mark a file cleaned while it still exists.
  delete from party_reset.photo_cleanup as q where request_id=p_request and path=any(p_paths)
    and not exists(select 1 from storage.objects o where o.bucket_id='photo-hunt' and o.name=q.path);
  return party_reset.status(p_request);
end;
$$;

revoke all on all functions in schema party_reset from public,anon,authenticated;
grant execute on function party_reset.status(uuid),party_reset.reset(uuid,text),party_reset.ack_photos(uuid,text[]) to authenticated;
create function public.admin_party_reset_status(p_request uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $$ select party_reset.status(p_request); $$;
create function public.admin_reset_party_data(p_request uuid,p_confirmation text) returns jsonb
language sql security invoker set search_path='' as $$ select party_reset.reset(p_request,p_confirmation); $$;
create function public.admin_ack_party_reset_photos(p_request uuid,p_paths text[]) returns jsonb
language sql security invoker set search_path='' as $$ select party_reset.ack_photos(p_request,p_paths); $$;
revoke all on function public.admin_party_reset_status(uuid),public.admin_reset_party_data(uuid,text),public.admin_ack_party_reset_photos(uuid,text[]) from public,anon;
grant execute on function public.admin_party_reset_status(uuid),public.admin_reset_party_data(uuid,text),public.admin_ack_party_reset_photos(uuid,text[]) to authenticated;

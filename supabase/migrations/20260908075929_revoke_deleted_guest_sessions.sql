-- Deleting an invited person must also invalidate every credential that can
-- still act as that person. Game rows stay in place so scores and history are
-- preserved; only their private session tokens are rotated.
create function party_identity.revoke_player_keys(p_player_keys text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_keys text[];
begin
  select coalesce(array_agg(distinct player_key), array[]::text[])
  into v_player_keys
  from unnest(p_player_keys) as player_key
  where player_key like 'guest:%' or player_key like 'plus:%';

  if cardinality(v_player_keys) = 0 then
    return;
  end if;

  -- Serialize deletion with identity claims so no claim can survive halfway
  -- through the revocation.
  perform pg_catalog.pg_advisory_xact_lock(725260903203559::bigint);

  insert into party_identity.revoked_tokens(session_token)
    select session_token
    from public.party_identity_sessions
    where player_key = any(v_player_keys)
    union
    select session_token
    from public.live_vote_players
    where player_key = any(v_player_keys)
    union
    select session_token
    from public.secret_mission_players
    where player_key = any(v_player_keys)
    on conflict do nothing;

  update public.live_vote_players as player
  set session_token = gen_random_uuid()
  where player.player_key = any(v_player_keys);

  update public.secret_mission_players as player
  set session_token = gen_random_uuid()
  where player.player_key = any(v_player_keys);

  delete from public.party_identity_sessions as identity_session
  where identity_session.player_key = any(v_player_keys);
end;
$$;

revoke all on function party_identity.revoke_player_keys(text[])
from public, anon, authenticated;

create function party_identity.revoke_deleted_guest_sessions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_keys text[];
begin
  select array['guest:' || old.id::text]
         || coalesce(
              array_agg('plus:' || plus_one.id::text)
                filter (where plus_one.id is not null),
              array[]::text[]
            )
  into v_player_keys
  from public.plus_ones as plus_one
  where plus_one.guest_id = old.id;

  perform party_identity.revoke_player_keys(v_player_keys);
  return old;
end;
$$;

revoke all on function party_identity.revoke_deleted_guest_sessions()
from public, anon, authenticated;

create function party_identity.revoke_deleted_plus_one_sessions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform party_identity.revoke_player_keys(array['plus:' || old.id::text]);
  return old;
end;
$$;

revoke all on function party_identity.revoke_deleted_plus_one_sessions()
from public, anon, authenticated;

drop trigger if exists guests_revoke_identity_before_delete on public.guests;
create trigger guests_revoke_identity_before_delete
before delete on public.guests
for each row execute function party_identity.revoke_deleted_guest_sessions();

drop trigger if exists plus_ones_revoke_identity_before_delete on public.plus_ones;
create trigger plus_ones_revoke_identity_before_delete
before delete on public.plus_ones
for each row execute function party_identity.revoke_deleted_plus_one_sessions();

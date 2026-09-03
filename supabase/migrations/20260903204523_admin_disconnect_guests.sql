-- Guest identities are separate from Supabase Auth (the administrators).
-- Installing this migration does NOT disconnect anybody.
create schema party_identity;
revoke all on schema party_identity from public;
grant usage on schema party_identity to anon, authenticated;

create table party_identity.revoked_tokens (
  session_token uuid primary key,
  revoked_at timestamptz not null default now()
);
alter table party_identity.revoked_tokens enable row level security;
revoke all on party_identity.revoked_tokens from public, anon, authenticated;

-- Keep the existing game/score behaviour behind a private, non-callable copy.
-- Replacing the public functions in place preserves their OIDs/dependencies.
do $$
declare n text; definition text;
begin
  foreach n in array array['claim_party_identity','claim_live_vote_identity','claim_secret_mission'] loop
    definition := pg_get_functiondef(to_regprocedure('public.' || n || '(text,uuid)'));
    if definition is null then raise exception 'Missing identity function: %', n; end if;
    execute replace(definition, 'FUNCTION public.' || n || '(', 'FUNCTION party_identity.legacy_' || n || '(');
    execute format('alter function party_identity.legacy_%I(text,uuid) set search_path = %L', n, '');
    execute format('revoke all on function party_identity.legacy_%I(text,uuid) from public, anon, authenticated', n);
  end loop;
end;
$$;

create function party_identity.claim(p_kind text, p_player_key text, p_session_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  -- Claims and a global reset cannot interleave. Acquire before player locks.
  perform pg_catalog.pg_advisory_xact_lock_shared(725260903203559::bigint);
  if p_session_token is null or exists (
    select 1 from party_identity.revoked_tokens where session_token = p_session_token
  ) then
    return jsonb_build_object('ok',false,'code','INVALID_SESSION');
  end if;
  case p_kind
    when 'party' then return party_identity.legacy_claim_party_identity(p_player_key,p_session_token);
    when 'room' then return party_identity.legacy_claim_live_vote_identity(p_player_key,p_session_token);
    when 'missions' then return party_identity.legacy_claim_secret_mission(p_player_key,p_session_token);
    else raise exception 'INVALID_IDENTITY_KIND';
  end case;
end;
$$;
revoke all on function party_identity.claim(text,text,uuid) from public;
grant execute on function party_identity.claim(text,text,uuid) to anon, authenticated;

create or replace function public.claim_party_identity(p_player_key text,p_session_token uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select party_identity.claim('party',p_player_key,p_session_token);
$$;
create or replace function public.claim_live_vote_identity(p_player_key text,p_session_token uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select party_identity.claim('room',p_player_key,p_session_token);
$$;
create or replace function public.claim_secret_mission(p_player_key text,p_session_token uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select party_identity.claim('missions',p_player_key,p_session_token);
$$;
revoke all on function public.claim_party_identity(text,uuid), public.claim_live_vote_identity(text,uuid), public.claim_secret_mission(text,uuid) from public;
grant execute on function public.claim_party_identity(text,uuid), public.claim_live_vote_identity(text,uuid), public.claim_secret_mission(text,uuid) to anon, authenticated;

create function party_identity.is_valid(p_player_key text,p_session_token uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.party_identity_sessions
    where player_key=p_player_key and session_token=p_session_token)
    and public.live_vote_player_name(p_player_key) is not null
    and not exists(select 1 from party_identity.revoked_tokens where session_token=p_session_token);
$$;
revoke all on function party_identity.is_valid(text,uuid) from public;
grant execute on function party_identity.is_valid(text,uuid) to anon, authenticated;
create function public.party_identity_is_valid(p_player_key text,p_session_token uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select party_identity.is_valid(p_player_key,p_session_token);
$$;
revoke all on function public.party_identity_is_valid(text,uuid) from public;
grant execute on function public.party_identity_is_valid(text,uuid) to anon, authenticated;

create function party_identity.disconnect_all(p_confirm boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if not exists(select 1 from public.app_admins where user_id=(select auth.uid())) then
    raise exception 'NOT_ADMIN' using errcode='42501';
  end if;
  if p_confirm is distinct from true then raise exception 'CONFIRMATION_REQUIRED'; end if;
  perform pg_catalog.pg_advisory_xact_lock(725260903203559::bigint);
  select count(*) into v_count from (
    select player_key from public.party_identity_sessions
    union select player_key from public.live_vote_players
    union select player_key from public.secret_mission_players
  ) identities;
  insert into party_identity.revoked_tokens(session_token)
    select session_token from public.party_identity_sessions
    union select session_token from public.live_vote_players
    union select session_token from public.secret_mission_players
    on conflict do nothing;
  -- Invalidate credentials, never delete game players or their dependent data.
  update public.live_vote_players set session_token=gen_random_uuid();
  update public.secret_mission_players set session_token=gen_random_uuid();
  delete from public.party_identity_sessions;
  return jsonb_build_object('ok',true,'disconnected',v_count);
end;
$$;
revoke all on function party_identity.disconnect_all(boolean) from public, anon;
grant execute on function party_identity.disconnect_all(boolean) to authenticated;
create function public.admin_disconnect_party_guests(p_confirm boolean default false)
returns jsonb language sql security invoker set search_path = '' as $$
  select party_identity.disconnect_all(p_confirm);
$$;
revoke all on function public.admin_disconnect_party_guests(boolean) from public, anon;
grant execute on function public.admin_disconnect_party_guests(boolean) to authenticated;
notify pgrst, 'reload schema';

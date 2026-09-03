-- Replace the implementation only; installing this migration disconnects nobody.
-- Keep the existing admin check, explicit confirmation and claim/reset lock.
create or replace function party_identity.disconnect_all(p_confirm boolean)
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

  -- PostgREST loads safeupdate. Scope every mutation to recorded revoked tokens
  -- instead of disabling that safeguard or using an unconditional WHERE true.
  update public.live_vote_players as player
    set session_token=gen_random_uuid()
    where exists (select 1 from party_identity.revoked_tokens as revoked
      where revoked.session_token=player.session_token);
  update public.secret_mission_players as player
    set session_token=gen_random_uuid()
    where exists (select 1 from party_identity.revoked_tokens as revoked
      where revoked.session_token=player.session_token);
  delete from public.party_identity_sessions as identity_session
    where exists (select 1 from party_identity.revoked_tokens as revoked
      where revoked.session_token=identity_session.session_token);

  return jsonb_build_object('ok',true,'disconnected',v_count);
end;
$$;
revoke all on function party_identity.disconnect_all(boolean) from public, anon;
grant execute on function party_identity.disconnect_all(boolean) to authenticated;
notify pgrst, 'reload schema';

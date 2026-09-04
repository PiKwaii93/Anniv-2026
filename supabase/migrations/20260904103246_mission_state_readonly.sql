-- Witness approval is polled. Reading an existing assignment must not rewrite
-- the scoreboard and broadcast another update to every guest on every poll.
create function party_missions.player_state(p_player_key text,p_session_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.secret_mission_players%rowtype;
begin
  perform pg_advisory_xact_lock_shared(725260903203559);
  if party_identity.is_valid(p_player_key,p_session_token) is distinct from true then
    return jsonb_build_object('ok',false,'code','INVALID_SESSION'); end if;
  select * into p from public.secret_mission_players where player_key=p_player_key;
  if not found or p.current_prompt_id is null or p.session_token is distinct from p_session_token
    or p.player_name is distinct from public.private_secret_mission_player_name(p_player_key) then
    return public.claim_secret_mission(p_player_key,p_session_token);
  end if;
  return public.private_secret_mission_payload(p.id);
end;
$$;
revoke all on function party_missions.player_state(text,uuid) from public;
grant execute on function party_missions.player_state(text,uuid) to anon,authenticated;
create or replace function public.get_secret_mission_state(p_player_key text,p_session_token uuid)
returns jsonb language sql security invoker set search_path='' as $$ select party_missions.player_state(p_player_key,p_session_token); $$;

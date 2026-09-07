create or replace function public.get_photo_hunt_player_state(p_player_key text, p_session_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_player_name text;
  v_submissions jsonb;
begin
  v_player_name := public.photo_hunt_identity_name(p_player_key, p_session_token);
  if v_player_name is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SESSION');
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x."createdAt" desc), '[]'::jsonb)
  into v_submissions
  from (
    select distinct on (challenge_id)
      id,
      challenge_id as "challengeId",
      status,
      caption,
      created_at as "createdAt",
      moderated_at as "moderatedAt"
    from public.photo_hunt_submissions
    where player_key = p_player_key
    order by challenge_id, created_at desc
  ) x;

  update public.party_identity_sessions
  set last_seen_at = now(), updated_at = now()
  where player_key = p_player_key and session_token = p_session_token;

  return jsonb_build_object(
    'ok', true,
    'playerName', v_player_name,
    'submissions', v_submissions
  );
end;
$function$;

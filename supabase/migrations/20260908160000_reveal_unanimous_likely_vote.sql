create or replace function public.admin_advance_likely_vote()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_round_id uuid;
  v_round public.live_vote_rounds%rowtype;
  v_finalists jsonb;
  v_count integer;
  v_total integer;
  v_item jsonb;
  v_result jsonb;
  v_closes_at timestamptz;
begin
  if not exists (
    select 1 from public.app_admins
    where user_id = (select auth.uid())
  ) then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN');
  end if;

  select current_round_id into v_round_id
  from public.live_vote_control
  where id = 'main'
  for update;

  select * into v_round
  from public.live_vote_rounds
  where id = v_round_id
  for update;

  if not found or v_round.status <> 'open' or v_round.mode <> 'likely' or v_round.stage <> 'nomination' then
    return jsonb_build_object('ok', false, 'code', 'NOT_NOMINATION_STAGE');
  end if;

  with ranked as (
    select choice_key, count(*)::integer as votes
    from public.live_vote_votes
    where round_id = v_round.id
      and stage = 'nomination'
    group by choice_key
    order by votes desc, random()
    limit 4
  )
  select
    count(*)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'key', choice_key,
          'label', public.live_vote_player_name(choice_key)
        )
        order by votes desc
      ),
      '[]'::jsonb
    )
  into v_count, v_finalists
  from ranked;

  if v_count = 0 then
    return jsonb_build_object('ok', false, 'code', 'NO_NOMINATIONS');
  end if;

  if v_count = 1 then
    select count(*)::integer into v_total
    from public.live_vote_votes
    where round_id = v_round.id
      and stage = 'nomination';

    v_item := v_finalists->0;
    v_result := jsonb_build_object(
      'rows', jsonb_build_array(
        v_item || jsonb_build_object(
          'count', v_total,
          'percentage', 100,
          'correct', false
        )
      ),
      'totalVotes', v_total,
      'winnerKeys', jsonb_build_array(v_item->>'key'),
      'correctKey', null
    );

    update public.live_vote_rounds
    set status = 'revealed',
        finalists = v_finalists,
        result = v_result,
        revealed_at = now()
    where id = v_round.id;

    perform public.refresh_live_vote_public_state();

    return jsonb_build_object(
      'ok', true,
      'revealed', true,
      'result', v_result
    );
  end if;

  if v_round.timer_seconds is not null then
    v_closes_at := now() + make_interval(secs => v_round.timer_seconds);
  end if;

  update public.live_vote_rounds
  set stage = 'final',
      finalists = v_finalists,
      opened_at = now(),
      closes_at = v_closes_at
  where id = v_round.id;

  perform public.refresh_live_vote_public_state();

  return jsonb_build_object('ok', true, 'revealed', false, 'finalists', v_finalists);
end;
$function$;

revoke all on function public.admin_advance_likely_vote() from public, anon;
grant execute on function public.admin_advance_likely_vote() to authenticated;


create or replace function public.claim_party_identity(p_player_key text, p_session_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_name text;
  v_existing public.party_identity_sessions%rowtype;
  v_token_owner public.party_identity_sessions%rowtype;
begin
  if p_session_token is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SESSION');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('identity-player:' || p_player_key, 0));
  perform pg_advisory_xact_lock(hashtextextended('identity-token:' || p_session_token::text, 0));

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
  where session_token = p_session_token
  for update;

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
$function$;

create or replace function public.release_party_identity(p_player_key text, p_session_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_existing public.party_identity_sessions%rowtype;
begin
  if p_session_token is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SESSION');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('identity-player:' || p_player_key, 0));
  perform pg_advisory_xact_lock(hashtextextended('identity-token:' || p_session_token::text, 0));

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
$function$;

create or replace function public.claim_live_vote_identity(p_player_key text, p_session_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  perform pg_advisory_xact_lock(hashtextextended('identity-player:' || p_player_key, 0));
  perform pg_advisory_xact_lock(hashtextextended('identity-token:' || p_session_token::text, 0));

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
        and player_key <> p_player_key
      for update;

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
  where session_token = p_session_token
  for update;

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
$function$;

create or replace function public.claim_secret_mission(p_player_key text, p_session_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_name text;
  v_player public.secret_mission_players%rowtype;
  v_global_token uuid;
  v_has_global boolean := false;
begin
  if p_session_token is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SESSION');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('identity-player:' || p_player_key, 0));
  perform pg_advisory_xact_lock(hashtextextended('identity-token:' || p_session_token::text, 0));

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
$function$;

create or replace function public.cast_live_vote(p_player_key text, p_session_token uuid, p_round_id uuid, p_choice_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_player public.live_vote_players%rowtype;
  v_round public.live_vote_rounds%rowtype;
  v_current_round_id uuid;
  v_valid boolean := false;
  v_vote_count integer;
begin
  select * into v_player
  from public.live_vote_players
  where player_key = p_player_key
    and session_token = p_session_token;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SESSION');
  end if;

  select current_round_id into v_current_round_id
  from public.live_vote_control
  where id = 'main'
  for share;

  if v_current_round_id is distinct from p_round_id then
    return jsonb_build_object('ok', false, 'code', 'ROUND_CHANGED');
  end if;

  select * into v_round
  from public.live_vote_rounds
  where id = p_round_id
  for share;

  if not found or v_round.status <> 'open' then
    return jsonb_build_object('ok', false, 'code', 'ROUND_CLOSED');
  end if;

  if v_round.closes_at is not null and now() >= v_round.closes_at then
    return jsonb_build_object('ok', false, 'code', 'ROUND_CLOSED');
  end if;

  if v_round.stage = 'nomination' then
    v_valid := public.live_vote_player_name(p_choice_key) is not null;
  elsif v_round.stage = 'final' then
    select exists (
      select 1
      from jsonb_array_elements(v_round.finalists) item
      where item->>'key' = p_choice_key
    ) into v_valid;
  elsif v_round.mode in ('majority', 'predict') then
    select exists (
      select 1
      from jsonb_array_elements_text(v_round.options_snapshot) value
      where value = p_choice_key
    ) into v_valid;
  elsif v_round.mode = 'who_said' then
    select exists (
      select 1
      from jsonb_array_elements(v_round.suspects_snapshot) item
      where item->>'key' = p_choice_key
    ) into v_valid;
  end if;

  if not v_valid then
    return jsonb_build_object('ok', false, 'code', 'INVALID_CHOICE');
  end if;

  insert into public.live_vote_votes (
    round_id,
    stage,
    player_key,
    choice_key,
    updated_at
  ) values (
    v_round.id,
    v_round.stage,
    p_player_key,
    p_choice_key,
    now()
  )
  on conflict (round_id, stage, player_key)
  do update set
    choice_key = excluded.choice_key,
    updated_at = now();

  update public.live_vote_players
  set last_seen_at = now()
  where player_key = p_player_key;

  perform public.refresh_live_vote_public_state();

  select count(*)::integer into v_vote_count
  from public.live_vote_votes
  where round_id = v_round.id
    and stage = v_round.stage;

  return jsonb_build_object(
    'ok', true,
    'myVote', p_choice_key,
    'voteCount', v_vote_count
  );
end;
$function$;

create or replace function public.admin_start_live_vote(p_question_id uuid, p_timer_seconds integer default null::integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_question public.live_vote_questions%rowtype;
  v_current uuid;
  v_current_status text;
  v_round_id uuid;
  v_timer integer;
  v_closes_at timestamptz;
  v_stage text;
begin
  if not exists (
    select 1 from public.app_admins
    where user_id = (select auth.uid())
  ) then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN');
  end if;

  select current_round_id into v_current
  from public.live_vote_control
  where id = 'main'
  for update;

  if v_current is not null then
    select status into v_current_status
    from public.live_vote_rounds
    where id = v_current;

    if v_current_status = 'open' then
      return jsonb_build_object('ok', false, 'code', 'ROUND_ALREADY_OPEN');
    end if;
  end if;

  select * into v_question
  from public.live_vote_questions
  where id = p_question_id
    and is_active = true;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'QUESTION_NOT_AVAILABLE');
  end if;

  if v_question.mode in ('majority', 'predict')
     and jsonb_array_length(v_question.options) not between 2 and 4 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_OPTIONS');
  end if;

  if v_question.mode = 'who_said' then
    if jsonb_array_length(v_question.suspects) not between 4 and 6 then
      return jsonb_build_object('ok', false, 'code', 'INVALID_SUSPECTS');
    end if;

    if not exists (
      select 1 from jsonb_array_elements(v_question.suspects) item
      where item->>'key' = v_question.correct_player_key
    ) then
      return jsonb_build_object('ok', false, 'code', 'INVALID_CORRECT_ANSWER');
    end if;
  end if;

  v_timer := coalesce(p_timer_seconds, v_question.timer_seconds);
  if v_timer is not null and v_timer not in (15, 30, 60) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_TIMER');
  end if;

  if v_timer is not null then
    v_closes_at := now() + make_interval(secs => v_timer);
  end if;

  v_stage := case when v_question.mode = 'likely' then 'nomination' else 'single' end;

  insert into public.live_vote_rounds (
    question_id,
    mode,
    prompt,
    options_snapshot,
    correct_player_key,
    suspects_snapshot,
    reveal_note,
    stage,
    timer_seconds,
    closes_at
  ) values (
    v_question.id,
    v_question.mode,
    v_question.prompt,
    v_question.options,
    v_question.correct_player_key,
    v_question.suspects,
    v_question.reveal_note,
    v_stage,
    v_timer,
    v_closes_at
  ) returning id into v_round_id;

  update public.live_vote_control
  set current_round_id = v_round_id,
      updated_at = now()
  where id = 'main';

  perform public.refresh_live_vote_public_state();

  return jsonb_build_object('ok', true, 'roundId', v_round_id, 'stage', v_stage);
end;
$function$;

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

  if v_count < 2 then
    return jsonb_build_object('ok', false, 'code', 'NOT_ENOUGH_NOMINATIONS');
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

  return jsonb_build_object('ok', true, 'finalists', v_finalists);
end;
$function$;

create or replace function public.admin_reveal_live_vote()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_round_id uuid;
  v_round public.live_vote_rounds%rowtype;
  v_choices jsonb := '[]'::jsonb;
  v_item jsonb;
  v_key text;
  v_label text;
  v_count integer;
  v_total integer := 0;
  v_max integer := 0;
  v_rows jsonb := '[]'::jsonb;
  v_winners jsonb := '[]'::jsonb;
  v_result jsonb;
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

  if not found or v_round.status <> 'open' then
    return jsonb_build_object('ok', false, 'code', 'NO_OPEN_ROUND');
  end if;

  if v_round.mode = 'likely' and v_round.stage <> 'final' then
    return jsonb_build_object('ok', false, 'code', 'FINAL_NOT_STARTED');
  end if;

  if v_round.stage = 'final' then
    v_choices := v_round.finalists;
  elsif v_round.mode in ('majority', 'predict') then
    select coalesce(
      jsonb_agg(jsonb_build_object('key', value, 'label', value)),
      '[]'::jsonb
    ) into v_choices
    from jsonb_array_elements_text(v_round.options_snapshot);
  elsif v_round.mode = 'who_said' then
    v_choices := v_round.suspects_snapshot;
  end if;

  select count(*)::integer into v_total
  from public.live_vote_votes
  where round_id = v_round.id
    and stage = v_round.stage;

  for v_item in select * from jsonb_array_elements(v_choices)
  loop
    v_key := v_item->>'key';
    v_label := coalesce(v_item->>'label', v_item->>'name', v_key);

    select count(*)::integer into v_count
    from public.live_vote_votes
    where round_id = v_round.id
      and stage = v_round.stage
      and choice_key = v_key;

    if v_count > v_max then
      v_max := v_count;
    end if;

    v_rows := v_rows || jsonb_build_array(
      jsonb_build_object(
        'key', v_key,
        'label', v_label,
        'count', v_count,
        'percentage', case when v_total > 0 then round((v_count::numeric * 100) / v_total, 1) else 0 end,
        'correct', case when v_round.mode = 'who_said' then v_key = v_round.correct_player_key else false end
      )
    );
  end loop;

  if v_round.mode = 'predict' and v_total > 0 then
    select coalesce(jsonb_agg(item->>'key'), '[]'::jsonb)
    into v_winners
    from jsonb_array_elements(v_rows) item
    where (item->>'count')::integer = v_max;

    update public.live_vote_players p
    set score = p.score + 1
    where p.player_key in (
      select v.player_key
      from public.live_vote_votes v
      where v.round_id = v_round.id
        and v.stage = v_round.stage
        and v.choice_key in (
          select value
          from jsonb_array_elements_text(v_winners)
        )
    );
  elsif v_round.mode = 'who_said' and v_total > 0 then
    update public.live_vote_players p
    set score = p.score + 1
    where p.player_key in (
      select v.player_key
      from public.live_vote_votes v
      where v.round_id = v_round.id
        and v.stage = v_round.stage
        and v.choice_key = v_round.correct_player_key
    );

    v_winners := jsonb_build_array(v_round.correct_player_key);
  elsif v_round.mode in ('majority', 'likely') and v_total > 0 then
    select coalesce(jsonb_agg(item->>'key'), '[]'::jsonb)
    into v_winners
    from jsonb_array_elements(v_rows) item
    where (item->>'count')::integer = v_max;
  end if;

  v_result := jsonb_build_object(
    'rows', v_rows,
    'totalVotes', v_total,
    'winnerKeys', v_winners,
    'correctKey', case when v_round.mode = 'who_said' then v_round.correct_player_key else null end
  );

  update public.live_vote_rounds
  set status = 'revealed',
      result = v_result,
      revealed_at = now()
  where id = v_round.id;

  perform public.refresh_live_vote_public_state();

  return jsonb_build_object('ok', true, 'result', v_result);
end;
$function$;

create or replace function public.admin_skip_live_vote()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_round_id uuid;
  v_round public.live_vote_rounds%rowtype;
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

  if v_round_id is null then
    return jsonb_build_object('ok', false, 'code', 'NO_ROUND');
  end if;

  select * into v_round
  from public.live_vote_rounds
  where id = v_round_id
  for update;

  if not found then
    update public.live_vote_control
    set current_round_id = null,
        updated_at = now()
    where id = 'main';
    perform public.refresh_live_vote_public_state();
    return jsonb_build_object('ok', false, 'code', 'NO_ROUND');
  end if;

  update public.live_vote_rounds
  set status = 'skipped'
  where id = v_round_id
    and status = 'open';

  update public.live_vote_control
  set current_round_id = null,
      updated_at = now()
  where id = 'main';

  perform public.refresh_live_vote_public_state();

  return jsonb_build_object('ok', true);
end;
$function$;

create or replace function public.admin_clear_live_vote()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_round_id uuid;
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

  if v_round_id is not null then
    perform 1 from public.live_vote_rounds
    where id = v_round_id
    for update;
  end if;

  update public.live_vote_control
  set current_round_id = null,
      updated_at = now()
  where id = 'main';

  perform public.refresh_live_vote_public_state();
  return jsonb_build_object('ok', true);
end;
$function$;

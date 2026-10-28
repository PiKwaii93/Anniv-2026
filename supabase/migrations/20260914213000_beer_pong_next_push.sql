create table public.beer_pong_push_events (
  event_key text primary key,
  match_id text not null,
  player_keys text[] not null
    check (cardinality(player_keys) between 1 and 4),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  sent_count integer not null default 0 check (sent_count >= 0),
  expired_count integer not null default 0 check (expired_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0)
);

alter table public.beer_pong_push_events enable row level security;

revoke all on table public.beer_pong_push_events
from public, anon, authenticated;
grant select, insert, update, delete on table public.beer_pong_push_events
to service_role;

create or replace function public.private_beer_pong_next_match(
  p_state jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_round jsonb;
  v_match jsonb;
begin
  if jsonb_typeof(p_state -> 'rounds') is distinct from 'array' then
    return null;
  end if;

  for v_round in
    select value
    from jsonb_array_elements(p_state -> 'rounds')
  loop
    if jsonb_typeof(v_round) is distinct from 'array' then
      continue;
    end if;

    for v_match in
      select value
      from jsonb_array_elements(v_round)
    loop
      if v_match ->> 'teamAId' is not null
        and v_match ->> 'teamBId' is not null
        and v_match ->> 'winnerTeamId' is null
      then
        return v_match;
      end if;
    end loop;
  end loop;

  return null;
end;
$$;

create or replace function public.record_beer_pong_winner(
  p_match_id text,
  p_winner_team_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state jsonb;
  v_before_next jsonb;
  v_after_next jsonb;
  v_match jsonb;
  v_previous_round jsonb;
  v_source_match jsonb;
  v_final jsonb;
  v_team jsonb;
  v_round_count integer;
  v_match_count integer;
  v_round_index integer;
  v_match_index integer;
  v_target_round_index integer := -1;
  v_target_match_index integer := -1;
  v_team_a text;
  v_team_b text;
  v_source_a text;
  v_source_b text;
  v_existing_winner text;
  v_old_winner text;
  v_champion text;
  v_player_id text;
  v_player_key text;
  v_player_keys text[] := array[]::text[];
  v_environment text;
  v_is_correction boolean;
  v_event_key text;
  v_inserted_event_key text;
begin
  if p_match_id is null
    or char_length(p_match_id) not between 1 and 128
    or p_winner_team_id is null
    or char_length(p_winner_team_id) not between 1 and 128
  then
    return jsonb_build_object('ok', false, 'code', 'INVALID_RESULT');
  end if;

  select state
  into v_state
  from public.beer_pong_state
  where id = 'main'
  for update;

  if not found
    or v_state ->> 'draftValidated' <> 'true'
    or jsonb_typeof(v_state -> 'rounds') is distinct from 'array'
  then
    return jsonb_build_object('ok', false, 'code', 'INVALID_MATCH');
  end if;

  select environment
  into v_environment
  from public.party_state
  where id = 'main';

  v_before_next := public.private_beer_pong_next_match(v_state);
  v_round_count := jsonb_array_length(v_state -> 'rounds');

  if v_round_count = 0 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_MATCH');
  end if;

  for v_round_index in 0..v_round_count - 1 loop
    if jsonb_typeof(v_state #> array['rounds', v_round_index::text]) is distinct from 'array' then
      continue;
    end if;

    v_match_count := jsonb_array_length(
      v_state #> array['rounds', v_round_index::text]
    );

    if v_match_count = 0 then
      continue;
    end if;

    for v_match_index in 0..v_match_count - 1 loop
      v_match := v_state #> array[
        'rounds', v_round_index::text, v_match_index::text
      ];

      if v_match ->> 'id' = p_match_id then
        v_target_round_index := v_round_index;
        v_target_match_index := v_match_index;
        v_team_a := v_match ->> 'teamAId';
        v_team_b := v_match ->> 'teamBId';
        v_old_winner := v_match ->> 'winnerTeamId';
        exit;
      end if;
    end loop;

    exit when v_target_round_index >= 0;
  end loop;

  if v_target_round_index < 0
    or v_team_a is null
    or v_team_b is null
    or p_winner_team_id not in (v_team_a, v_team_b)
  then
    return jsonb_build_object('ok', false, 'code', 'INVALID_WINNER');
  end if;

  if v_old_winner = p_winner_team_id then
    return jsonb_build_object(
      'ok', true,
      'changed', false,
      'correction', false,
      'eventKey', null,
      'state', v_state
    );
  end if;

  v_is_correction := v_old_winner is not null;
  v_state := jsonb_set(
    v_state,
    array[
      'rounds',
      v_target_round_index::text,
      v_target_match_index::text,
      'winnerTeamId'
    ],
    to_jsonb(p_winner_team_id),
    false
  );

  if v_round_count > 1 then
    for v_round_index in 1..v_round_count - 1 loop
      v_previous_round := v_state #> array[
        'rounds', (v_round_index - 1)::text
      ];
      v_match_count := jsonb_array_length(
        v_state #> array['rounds', v_round_index::text]
      );

      if v_match_count = 0 then
        continue;
      end if;

      for v_match_index in 0..v_match_count - 1 loop
        v_match := v_state #> array[
          'rounds', v_round_index::text, v_match_index::text
        ];
        v_source_a := v_match ->> 'teamASourceMatchId';
        v_source_b := v_match ->> 'teamBSourceMatchId';
        v_team_a := null;
        v_team_b := null;

        for v_source_match in
          select value
          from jsonb_array_elements(v_previous_round)
        loop
          if v_source_match ->> 'id' = v_source_a then
            v_team_a := v_source_match ->> 'winnerTeamId';
          end if;
          if v_source_match ->> 'id' = v_source_b then
            v_team_b := v_source_match ->> 'winnerTeamId';
          end if;
        end loop;

        v_state := jsonb_set(
          v_state,
          array['rounds', v_round_index::text, v_match_index::text, 'teamAId'],
          coalesce(to_jsonb(v_team_a), 'null'::jsonb),
          false
        );
        v_state := jsonb_set(
          v_state,
          array['rounds', v_round_index::text, v_match_index::text, 'teamBId'],
          coalesce(to_jsonb(v_team_b), 'null'::jsonb),
          false
        );

        v_existing_winner := v_match ->> 'winnerTeamId';
        if v_team_a is null
          or v_team_b is null
          or v_existing_winner not in (v_team_a, v_team_b)
        then
          v_state := jsonb_set(
            v_state,
            array['rounds', v_round_index::text, v_match_index::text, 'winnerTeamId'],
            'null'::jsonb,
            false
          );
        end if;
      end loop;
    end loop;
  end if;

  v_final := v_state #> array[
    'rounds',
    (v_round_count - 1)::text,
    '0'
  ];

  if v_final ->> 'teamAId' is not null
    and v_final ->> 'teamBId' is not null
    and (v_final ->> 'winnerTeamId') in (
      v_final ->> 'teamAId',
      v_final ->> 'teamBId'
    )
  then
    v_champion := v_final ->> 'winnerTeamId';
  else
    v_champion := null;
  end if;

  v_state := jsonb_set(
    v_state,
    array['championTeamId'],
    coalesce(to_jsonb(v_champion), 'null'::jsonb),
    true
  );

  update public.beer_pong_state
  set state = v_state
  where id = 'main';

  v_after_next := public.private_beer_pong_next_match(v_state);

  if v_environment = 'live'
    and not v_is_correction
    and v_before_next ->> 'id' = p_match_id
    and v_after_next ->> 'id' is not null
    and v_after_next ->> 'id' <> p_match_id
  then
    for v_team in
      select value
      from jsonb_array_elements(v_state -> 'teams')
      where value ->> 'id' in (
        v_after_next ->> 'teamAId',
        v_after_next ->> 'teamBId'
      )
    loop
      if jsonb_typeof(v_team -> 'playerIds') is distinct from 'array' then
        continue;
      end if;

      for v_player_id in
        select jsonb_array_elements_text(v_team -> 'playerIds')
      loop
        v_player_key := case
          when v_player_id like 'guest:%' then v_player_id
          when v_player_id like 'plus-one:%'
            then 'plus:' || substring(v_player_id from 10)
          else null
        end;

        if v_player_key is not null
          and not (v_player_key = any(v_player_keys))
        then
          v_player_keys := array_append(v_player_keys, v_player_key);
        end if;
      end loop;
    end loop;

    if cardinality(v_player_keys) > 0 then
      v_event_key := 'beer-pong-next:' || (v_after_next ->> 'id');

      insert into public.beer_pong_push_events (
        event_key,
        match_id,
        player_keys
      ) values (
        v_event_key,
        v_after_next ->> 'id',
        v_player_keys
      )
      on conflict (event_key) do nothing
      returning event_key into v_inserted_event_key;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'changed', true,
    'correction', v_is_correction,
    'eventKey', v_inserted_event_key,
    'state', v_state
  );
end;
$$;

revoke all on function public.private_beer_pong_next_match(jsonb)
from public, anon, authenticated;
revoke all on function public.record_beer_pong_winner(text, text)
from public, anon, authenticated;
grant execute on function public.record_beer_pong_winner(text, text)
to service_role;

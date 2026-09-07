create or replace function public.get_party_hall_of_fame()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_beer jsonb := '{}'::jsonb;
  v_participants integer := 0;
  v_mission_agents integer := 0;
  v_mission_completed integer := 0;
  v_mission_ranking jsonb := '[]'::jsonb;
  v_room_players integer := 0;
  v_room_points integer := 0;
  v_room_rounds integer := 0;
  v_room_votes integer := 0;
  v_room_ranking jsonb := '[]'::jsonb;
  v_popular_round jsonb := null;
begin
  select coalesce(state, '{}'::jsonb)
    into v_beer
    from public.beer_pong_state
    where id = 'main';

  select
    count(*) filter (where g.status = 'confirmed')::integer
    + count(po.id) filter (where g.status = 'confirmed')::integer
    into v_participants
    from public.guests g
    left join public.plus_ones po on po.guest_id = g.id;

  select
    count(*)::integer,
    coalesce(sum(completed_count), 0)::integer
    into v_mission_agents, v_mission_completed
    from public.secret_mission_scoreboard;

  select coalesce(jsonb_agg(row_data order by rank_order, player_name), '[]'::jsonb)
    into v_mission_ranking
    from (
      select
        player_name,
        completed_count,
        completed_count as rank_order,
        jsonb_build_object(
          'name', player_name,
          'score', completed_count
        ) as row_data
      from public.secret_mission_scoreboard
      where completed_count > 0
      order by completed_count desc, player_name asc
      limit 8
    ) ranked;

  select
    count(*)::integer,
    coalesce(sum(score), 0)::integer
    into v_room_players, v_room_points
    from public.live_vote_players;

  select count(*)::integer
    into v_room_rounds
    from public.live_vote_rounds
    where status = 'revealed';

  select count(*)::integer
    into v_room_votes
    from public.live_vote_votes;

  select coalesce(jsonb_agg(row_data order by rank_order desc, player_name), '[]'::jsonb)
    into v_room_ranking
    from (
      select
        player_name,
        score,
        score as rank_order,
        jsonb_build_object(
          'name', player_name,
          'score', score
        ) as row_data
      from public.live_vote_players
      where score > 0
      order by score desc, player_name asc
      limit 8
    ) ranked;

  select jsonb_build_object(
      'prompt', prompt,
      'mode', mode,
      'votes', coalesce((result ->> 'totalVotes')::integer, 0)
    )
    into v_popular_round
    from public.live_vote_rounds
    where status = 'revealed'
      and result is not null
    order by coalesce((result ->> 'totalVotes')::integer, 0) desc, revealed_at asc nulls last
    limit 1;

  return jsonb_build_object(
    'participants', v_participants,
    'beerPong', v_beer,
    'missions', jsonb_build_object(
      'agents', v_mission_agents,
      'completed', v_mission_completed,
      'ranking', v_mission_ranking
    ),
    'room', jsonb_build_object(
      'players', v_room_players,
      'points', v_room_points,
      'rounds', v_room_rounds,
      'votes', v_room_votes,
      'ranking', v_room_ranking,
      'popularRound', v_popular_round
    )
  );
end;
$$;

revoke all on function public.get_party_hall_of_fame() from public;
grant execute on function public.get_party_hall_of_fame() to anon, authenticated;

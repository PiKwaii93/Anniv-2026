create table if not exists public.screen_events (
  id uuid primary key default gen_random_uuid(),
  environment text not null default 'live' check (environment in ('live', 'rehearsal')),
  event_type text not null check (event_type in ('beer_pong_match_completed', 'bingo_full_house')),
  aggregate_key text not null,
  priority smallint not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  claimed_by text,
  unique (environment, aggregate_key)
);

create index if not exists screen_events_pending_idx
  on public.screen_events (environment, priority desc, created_at)
  where claimed_at is null;

alter table public.screen_events enable row level security;
revoke all on public.screen_events from public, anon, authenticated;

drop policy if exists "screen_events_are_visible" on public.screen_events;
create policy "screen_events_are_visible"
on public.screen_events
for select
to anon, authenticated
using (expires_at > clock_timestamp());

grant select on public.screen_events to anon, authenticated;

create or replace function public.claim_next_screen_event(
  p_consumer text default 'tv-main'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_environment text;
  v_event public.screen_events%rowtype;
begin
  delete from public.screen_events
   where expires_at <= clock_timestamp()
      or claimed_at < clock_timestamp() - interval '1 hour';

  select coalesce(environment, 'live')
    into v_environment
    from public.party_state
   where id = 'main';

  with candidate as (
    select id
      from public.screen_events
     where environment = coalesce(v_environment, 'live')
       and claimed_at is null
       and expires_at > clock_timestamp()
     order by priority desc, created_at asc
     for update skip locked
     limit 1
  )
  update public.screen_events as event
     set claimed_at = clock_timestamp(),
         claimed_by = left(coalesce(nullif(trim(p_consumer), ''), 'tv-main'), 80)
    from candidate
   where event.id = candidate.id
  returning event.* into v_event;

  if v_event.id is null then
    return null;
  end if;

  return to_jsonb(v_event);
end;
$$;

create or replace function public.complete_bingo_grid(
  p_grid_id uuid,
  p_player_key text,
  p_session_token uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_environment text;
  v_phase text;
  v_visible boolean;
  v_player_name text;
  v_inserted integer;
begin
  v_player_name := party_extras.identity_name(p_player_key, p_session_token);

  select coalesce(environment, 'live'), phase, bingo_visible
    into v_environment, v_phase, v_visible
    from public.party_state
   where id = 'main';

  if v_phase is distinct from 'live' or v_visible is distinct from true then
    return false;
  end if;

  insert into public.screen_events (
    environment,
    event_type,
    aggregate_key,
    priority,
    payload,
    expires_at
  ) values (
    coalesce(v_environment, 'live'),
    'bingo_full_house',
    'bingo:grid:' || p_grid_id::text,
    200,
    jsonb_build_object(
      'gridId', p_grid_id,
      'playerKey', trim(p_player_key),
      'playerName', v_player_name
    ),
    clock_timestamp() + interval '2 minutes'
  )
  on conflict (environment, aggregate_key) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;

create or replace function public.emit_beer_pong_screen_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_environment text;
  v_phase text;
  v_visible boolean;
  v_match jsonb;
  v_old_match jsonb;
  v_next_match jsonb;
  v_match_id text;
  v_winner_id text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  select coalesce(environment, 'live'), phase, beer_pong_visible
    into v_environment, v_phase, v_visible
    from public.party_state
   where id = 'main';

  if v_phase is distinct from 'live' or v_visible is distinct from true then
    return new;
  end if;

  for v_match in
    select round_match.value
      from jsonb_array_elements(coalesce(new.state -> 'rounds', '[]'::jsonb)) as tournament_round(value)
      cross join lateral jsonb_array_elements(coalesce(tournament_round.value, '[]'::jsonb)) as round_match(value)
  loop
    v_match_id := v_match ->> 'id';
    v_winner_id := v_match ->> 'winnerTeamId';

    if v_match_id is null
       or v_winner_id is null
       or v_match ->> 'teamAId' is null
       or v_match ->> 'teamBId' is null then
      continue;
    end if;

    select old_match.value
      into v_old_match
      from jsonb_array_elements(coalesce(old.state -> 'rounds', '[]'::jsonb)) as old_round(value)
      cross join lateral jsonb_array_elements(coalesce(old_round.value, '[]'::jsonb)) as old_match(value)
     where old_match.value ->> 'id' = v_match_id
     limit 1;

    if v_old_match is null or v_old_match ->> 'winnerTeamId' is not null then
      continue;
    end if;

    select pending_match.value
      into v_next_match
      from jsonb_array_elements(coalesce(new.state -> 'rounds', '[]'::jsonb)) with ordinality as pending_round(value, round_order)
      cross join lateral jsonb_array_elements(coalesce(pending_round.value, '[]'::jsonb)) with ordinality as pending_match(value, match_order)
     where pending_match.value ->> 'teamAId' is not null
       and pending_match.value ->> 'teamBId' is not null
       and pending_match.value ->> 'winnerTeamId' is null
     order by pending_round.round_order, pending_match.match_order
     limit 1;

    insert into public.screen_events (
      environment,
      event_type,
      aggregate_key,
      priority,
      payload,
      expires_at
    ) values (
      coalesce(v_environment, 'live'),
      'beer_pong_match_completed',
      'beer-pong:match:' || v_match_id || ':completed',
      300,
      jsonb_strip_nulls(jsonb_build_object(
        'matchId', v_match_id,
        'winnerTeamId', v_winner_id,
        'loserTeamId', case
          when v_match ->> 'teamAId' = v_winner_id then v_match ->> 'teamBId'
          else v_match ->> 'teamAId'
        end,
        'nextMatchId', v_next_match ->> 'id',
        'nextTeamAId', v_next_match ->> 'teamAId',
        'nextTeamBId', v_next_match ->> 'teamBId',
        'isChampion', coalesce(new.state ->> 'championTeamId', '') = v_winner_id
      )),
      clock_timestamp() + interval '90 seconds'
    )
    on conflict (environment, aggregate_key) do nothing;
  end loop;

  return new;
end;
$$;

drop trigger if exists beer_pong_screen_event_trigger on public.beer_pong_state;
create trigger beer_pong_screen_event_trigger
after update of state on public.beer_pong_state
for each row execute function public.emit_beer_pong_screen_events();

create or replace function public.clear_screen_events_on_party_reset()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.environment is distinct from old.environment then
    delete from public.screen_events
     where environment in (
       coalesce(old.environment, 'live'),
       coalesce(new.environment, 'live')
     );
  elsif new.data_epoch is distinct from old.data_epoch
     or (new.phase = 'preparation' and old.phase is distinct from 'preparation') then
    delete from public.screen_events
     where environment = coalesce(new.environment, 'live');
  end if;

  return new;
end;
$$;

drop trigger if exists party_reset_screen_events_trigger on public.party_state;
create trigger party_reset_screen_events_trigger
after update of environment, phase, data_epoch on public.party_state
for each row execute function public.clear_screen_events_on_party_reset();

revoke all on function public.claim_next_screen_event(text) from public;
revoke all on function public.complete_bingo_grid(uuid, text, uuid) from public;
revoke all on function public.emit_beer_pong_screen_events() from public, anon, authenticated;
revoke all on function public.clear_screen_events_on_party_reset() from public, anon, authenticated;
grant execute on function public.claim_next_screen_event(text) to anon, authenticated;
grant execute on function public.complete_bingo_grid(uuid, text, uuid) to anon, authenticated;

do $$
begin
  alter publication supabase_realtime add table public.screen_events;
exception
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';

alter table public.party_state
  add column if not exists room_visible boolean not null default true;

alter table public.party_state
  drop constraint if exists party_state_featured_module_check;

alter table public.party_state
  add constraint party_state_featured_module_check
  check (
    featured_module is null
    or featured_module = any (
      array['iceberg'::text, 'beer-pong'::text, 'bingo'::text, 'missions'::text, 'guests'::text, 'room'::text]
    )
  );

create table if not exists public.live_vote_questions (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('likely', 'majority', 'predict', 'who_said')),
  prompt text not null check (char_length(trim(prompt)) > 0),
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  correct_player_key text,
  suspects jsonb not null default '[]'::jsonb check (jsonb_typeof(suspects) = 'array'),
  reveal_note text not null default '',
  timer_seconds smallint check (timer_seconds is null or timer_seconds in (15, 30, 60)),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.live_vote_players (
  player_key text primary key,
  player_name text not null,
  session_token uuid not null unique,
  score integer not null default 0 check (score >= 0),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.live_vote_rounds (
  id uuid primary key default gen_random_uuid(),
  question_id uuid references public.live_vote_questions(id) on delete set null,
  mode text not null check (mode in ('likely', 'majority', 'predict', 'who_said')),
  prompt text not null,
  options_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(options_snapshot) = 'array'),
  correct_player_key text,
  suspects_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(suspects_snapshot) = 'array'),
  reveal_note text not null default '',
  stage text not null check (stage in ('single', 'nomination', 'final')),
  finalists jsonb not null default '[]'::jsonb check (jsonb_typeof(finalists) = 'array'),
  status text not null default 'open' check (status in ('open', 'revealed', 'skipped')),
  timer_seconds smallint check (timer_seconds is null or timer_seconds in (15, 30, 60)),
  opened_at timestamptz not null default now(),
  closes_at timestamptz,
  revealed_at timestamptz,
  result jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.live_vote_votes (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.live_vote_rounds(id) on delete cascade,
  stage text not null check (stage in ('single', 'nomination', 'final')),
  player_key text not null references public.live_vote_players(player_key) on delete cascade,
  choice_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, stage, player_key)
);

create index if not exists live_vote_votes_round_stage_idx
  on public.live_vote_votes(round_id, stage);

create table if not exists public.live_vote_control (
  id text primary key check (id = 'main'),
  current_round_id uuid references public.live_vote_rounds(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.live_vote_control (id)
values ('main')
on conflict (id) do nothing;

create table if not exists public.live_vote_public_state (
  id text primary key check (id = 'main'),
  state jsonb not null default '{"phase":"idle","roundId":null}'::jsonb check (jsonb_typeof(state) = 'object'),
  updated_at timestamptz not null default now()
);

insert into public.live_vote_public_state (id)
values ('main')
on conflict (id) do nothing;

alter table public.live_vote_questions enable row level security;
alter table public.live_vote_players enable row level security;
alter table public.live_vote_rounds enable row level security;
alter table public.live_vote_votes enable row level security;
alter table public.live_vote_control enable row level security;
alter table public.live_vote_public_state enable row level security;

create policy "Public can read live vote public state"
on public.live_vote_public_state
for select
to anon, authenticated
using (true);

create policy "Admins can manage live vote questions"
on public.live_vote_questions
for all
to authenticated
using (
  exists (
    select 1 from public.app_admins
    where app_admins.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.app_admins
    where app_admins.user_id = (select auth.uid())
  )
);

create policy "Admins can read live vote players"
on public.live_vote_players
for select
to authenticated
using (
  exists (
    select 1 from public.app_admins
    where app_admins.user_id = (select auth.uid())
  )
);

create policy "Admins can delete live vote players"
on public.live_vote_players
for delete
to authenticated
using (
  exists (
    select 1 from public.app_admins
    where app_admins.user_id = (select auth.uid())
  )
);

create policy "Admins can read live vote rounds"
on public.live_vote_rounds
for select
to authenticated
using (
  exists (
    select 1 from public.app_admins
    where app_admins.user_id = (select auth.uid())
  )
);

create policy "Admins can read live vote votes"
on public.live_vote_votes
for select
to authenticated
using (
  exists (
    select 1 from public.app_admins
    where app_admins.user_id = (select auth.uid())
  )
);

create policy "Admins can read live vote control"
on public.live_vote_control
for select
to authenticated
using (
  exists (
    select 1 from public.app_admins
    where app_admins.user_id = (select auth.uid())
  )
);

create or replace function public.live_vote_player_name(p_player_key text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
begin
  if p_player_key like 'guest:%' then
    begin
      v_id := substring(p_player_key from 7)::uuid;
    exception when others then
      return null;
    end;

    select g.name
      into v_name
      from public.guests g
      where g.id = v_id
        and g.status = 'confirmed';

    return v_name;
  end if;

  if p_player_key like 'plus:%' then
    begin
      v_id := substring(p_player_key from 6)::uuid;
    exception when others then
      return null;
    end;

    select p.name
      into v_name
      from public.plus_ones p
      join public.guests g on g.id = p.guest_id
      where p.id = v_id
        and g.status = 'confirmed';

    return v_name;
  end if;

  return null;
end;
$$;

revoke all on function public.live_vote_player_name(text) from public, anon, authenticated;

create or replace function public.refresh_live_vote_public_state()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round public.live_vote_rounds%rowtype;
  v_round_id uuid;
  v_vote_count integer := 0;
  v_options jsonb := '[]'::jsonb;
  v_phase text := 'idle';
  v_state jsonb;
begin
  select current_round_id
    into v_round_id
    from public.live_vote_control
    where id = 'main';

  if v_round_id is null then
    insert into public.live_vote_public_state (id, state, updated_at)
    values ('main', '{"phase":"idle","roundId":null}'::jsonb, now())
    on conflict (id) do update
      set state = excluded.state,
          updated_at = excluded.updated_at;
    return;
  end if;

  select * into v_round
    from public.live_vote_rounds
    where id = v_round_id;

  if not found then
    update public.live_vote_control
      set current_round_id = null,
          updated_at = now()
      where id = 'main';
    perform public.refresh_live_vote_public_state();
    return;
  end if;

  select count(*)::integer
    into v_vote_count
    from public.live_vote_votes
    where round_id = v_round.id
      and stage = v_round.stage;

  if v_round.stage = 'final' then
    v_options := v_round.finalists;
  elsif v_round.mode in ('majority', 'predict') then
    select coalesce(
      jsonb_agg(jsonb_build_object('key', value, 'label', value)),
      '[]'::jsonb
    )
      into v_options
      from jsonb_array_elements_text(v_round.options_snapshot);
  elsif v_round.mode = 'who_said' then
    v_options := v_round.suspects_snapshot;
  end if;

  if v_round.status = 'revealed' then
    v_phase := 'revealed';
  elsif v_round.status = 'open' then
    v_phase := 'open';
  else
    v_phase := 'idle';
  end if;

  v_state := jsonb_build_object(
    'phase', v_phase,
    'roundId', v_round.id,
    'mode', v_round.mode,
    'prompt', v_round.prompt,
    'stage', v_round.stage,
    'options', v_options,
    'voteCount', v_vote_count,
    'closesAt', v_round.closes_at,
    'result', case when v_round.status = 'revealed' then v_round.result else null end,
    'revealNote', case when v_round.status = 'revealed' then v_round.reveal_note else '' end
  );

  insert into public.live_vote_public_state (id, state, updated_at)
  values ('main', v_state, now())
  on conflict (id) do update
    set state = excluded.state,
        updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.refresh_live_vote_public_state() from public, anon, authenticated;

create or replace function public.claim_live_vote_identity(
  p_player_key text,
  p_session_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_existing public.live_vote_players%rowtype;
  v_token_owner public.live_vote_players%rowtype;
begin
  v_name := public.live_vote_player_name(p_player_key);

  if v_name is null then
    return jsonb_build_object('ok', false, 'code', 'PLAYER_NOT_AVAILABLE');
  end if;

  select * into v_existing
    from public.live_vote_players
    where player_key = p_player_key;

  if found then
    if v_existing.session_token <> p_session_token then
      return jsonb_build_object('ok', false, 'code', 'IDENTITY_ALREADY_CLAIMED');
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
    where session_token = p_session_token;

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
$$;

grant execute on function public.claim_live_vote_identity(text, uuid) to anon, authenticated;

create or replace function public.get_live_vote_player_state(
  p_player_key text,
  p_session_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player public.live_vote_players%rowtype;
  v_round_id uuid;
  v_round public.live_vote_rounds%rowtype;
  v_vote text;
begin
  select * into v_player
    from public.live_vote_players
    where player_key = p_player_key
      and session_token = p_session_token;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SESSION');
  end if;

  update public.live_vote_players
    set last_seen_at = now()
    where player_key = p_player_key;

  select current_round_id into v_round_id
    from public.live_vote_control
    where id = 'main';

  if v_round_id is not null then
    select * into v_round
      from public.live_vote_rounds
      where id = v_round_id;

    if found then
      select choice_key into v_vote
        from public.live_vote_votes
        where round_id = v_round.id
          and stage = v_round.stage
          and player_key = p_player_key;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'playerKey', v_player.player_key,
    'playerName', v_player.player_name,
    'score', v_player.score,
    'myVote', v_vote
  );
end;
$$;

grant execute on function public.get_live_vote_player_state(text, uuid) to anon, authenticated;

create or replace function public.cast_live_vote(
  p_player_key text,
  p_session_token uuid,
  p_round_id uuid,
  p_choice_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
    where id = 'main';

  if v_current_round_id is distinct from p_round_id then
    return jsonb_build_object('ok', false, 'code', 'ROUND_CHANGED');
  end if;

  select * into v_round
    from public.live_vote_rounds
    where id = p_round_id;

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
$$;

grant execute on function public.cast_live_vote(text, uuid, uuid, text) to anon, authenticated;

create or replace function public.get_live_vote_scoreboard()
returns table (
  player_key text,
  player_name text,
  score integer
)
language sql
security definer
set search_path = public
as $$
  select p.player_key, p.player_name, p.score
  from public.live_vote_players p
  order by p.score desc, p.player_name asc;
$$;

grant execute on function public.get_live_vote_scoreboard() to anon, authenticated;

create or replace function public.admin_start_live_vote(
  p_question_id uuid,
  p_timer_seconds integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
    from public.live_vote_control where id = 'main';

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
$$;

grant execute on function public.admin_start_live_vote(uuid, integer) to authenticated;

create or replace function public.admin_advance_likely_vote()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
    from public.live_vote_control where id = 'main';

  select * into v_round
    from public.live_vote_rounds
    where id = v_round_id;

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
$$;

grant execute on function public.admin_advance_likely_vote() to authenticated;

create or replace function public.admin_reveal_live_vote()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
    from public.live_vote_control where id = 'main';

  select * into v_round
    from public.live_vote_rounds
    where id = v_round_id;

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
$$;

grant execute on function public.admin_reveal_live_vote() to authenticated;

create or replace function public.admin_skip_live_vote()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
    from public.live_vote_control where id = 'main';

  if v_round_id is null then
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
$$;

grant execute on function public.admin_skip_live_vote() to authenticated;

create or replace function public.admin_clear_live_vote()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.app_admins
    where user_id = (select auth.uid())
  ) then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN');
  end if;

  update public.live_vote_control
    set current_round_id = null,
        updated_at = now()
    where id = 'main';

  perform public.refresh_live_vote_public_state();
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.admin_clear_live_vote() to authenticated;

create or replace function public.admin_reset_live_vote_identity(p_player_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.app_admins
    where user_id = (select auth.uid())
  ) then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN');
  end if;

  delete from public.live_vote_players
    where player_key = p_player_key;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.admin_reset_live_vote_identity(text) to authenticated;

insert into public.live_vote_questions (
  mode, prompt, options, reveal_note, timer_seconds, sort_order, is_active
) values
('likely', 'Qui est le plus susceptible de finir la soirée à 7h du matin ?', '[]'::jsonb, '', 30, 10, true),
('likely', 'Qui est le plus susceptible de perdre son téléphone ce soir ?', '[]'::jsonb, '', 30, 20, true),
('likely', 'Qui est le plus susceptible de lancer un after improvisé ?', '[]'::jsonb, '', 30, 30, true),
('likely', 'Qui survivrait le mieux à une apocalypse ?', '[]'::jsonb, '', 30, 40, true),
('likely', 'Qui est le plus susceptible de devenir célèbre par accident ?', '[]'::jsonb, '', 30, 50, true),
('likely', 'Qui est le plus susceptible de partir en voyage sur un coup de tête ?', '[]'::jsonb, '', 30, 60, true),
('majority', 'Il est 4h du matin : on rentre ou on continue ?', '["Rentrer dormir","Continuer l’after"]'::jsonb, '', 30, 70, true),
('majority', 'Pour une soirée : musique forte ou discussions tranquilles ?', '["Musique forte","Discussions tranquilles"]'::jsonb, '', 30, 80, true),
('majority', 'Le meilleur repas de fin de soirée ?', '["Pizza","Tacos","Burger","Kebab"]'::jsonb, '', 30, 90, true),
('majority', 'Vacances entre potes : mer ou montagne ?', '["Mer","Montagne"]'::jsonb, '', 30, 100, true),
('majority', 'Tu préfères gagner 10 000 € maintenant ou partir un mois en voyage ?', '["10 000 €","Un mois de voyage"]'::jsonb, '', 30, 110, true),
('predict', 'Selon toi, que va choisir la majorité : soirée organisée ou improvisée ?', '["Organisée","Improvisée"]'::jsonb, 'Ici, tu dois prédire le groupe — pas forcément répondre pour toi.', 30, 120, true),
('predict', 'Selon toi, quel choix sera majoritaire pour un week-end ?', '["Maison entre potes","Grande ville","Plage","Montagne"]'::jsonb, '', 30, 130, true),
('predict', 'Selon toi, quelle boisson sera la plus choisie ?', '["Bière","Cocktail","Vin","Soft"]'::jsonb, '', 30, 140, true),
('predict', 'Selon toi, que préfère le groupe pour une sortie ?', '["Bar","Restaurant","Activité","Soirée maison"]'::jsonb, '', 30, 150, true)
on conflict do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_vote_public_state'
  ) then
    alter publication supabase_realtime add table public.live_vote_public_state;
  end if;
end $$;

select public.refresh_live_vote_public_state();

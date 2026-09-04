-- Only a different, authenticated party identity can award a mission point.
create schema party_missions;
revoke all on schema party_missions from public;
grant usage on schema party_missions to anon, authenticated;

create table party_missions.validations (
  id uuid primary key,
  player_id uuid not null references public.secret_mission_players(id) on delete cascade,
  prompt_id uuid not null references public.secret_mission_prompts(id) on delete cascade,
  assigned_at timestamptz not null,
  reviewer_key text not null,
  reviewer_name text not null,
  prompt_text text not null,
  status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled')),
  created_at timestamptz not null default clock_timestamp(),
  reviewed_at timestamptz
);
alter table party_missions.validations enable row level security;
revoke all on party_missions.validations from public, anon, authenticated;
create unique index mission_validation_one_pending on party_missions.validations(player_id) where status='pending';
create index mission_validation_player on party_missions.validations(player_id,created_at desc);
create index mission_validation_reviewer on party_missions.validations(reviewer_key,created_at) where status='pending';
create index mission_validation_prompt on party_missions.validations(prompt_id);

create function party_missions.is_open() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.party_state where id='main' and missions_visible and phase<>'ended');
$$;

-- Skipping, replacing or resetting an assignment invalidates its pending witness request.
create function party_missions.cancel_stale() returns trigger language plpgsql security definer set search_path='' as $$
begin
  update party_missions.validations set status='cancelled',reviewed_at=clock_timestamp()
  where player_id=new.id and status='pending';
  return new;
end;
$$;
create trigger mission_validation_assignment_changed after update of current_prompt_id,assigned_at on public.secret_mission_players
for each row when (old.current_prompt_id is distinct from new.current_prompt_id or old.assigned_at is distinct from new.assigned_at)
execute function party_missions.cancel_stale();

create function party_missions.checks(p_player_key text,p_session_token uuid,p_summary boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_own jsonb; v_incoming jsonb; v_count integer;
begin
  if party_identity.is_valid(p_player_key,p_session_token) is distinct from true then
    return jsonb_build_object('ok',false,'code','INVALID_SESSION');
  end if;
  select count(*) into v_count from party_missions.validations v
  join public.secret_mission_players p on p.id=v.player_id
  where v.reviewer_key=p_player_key and v.status='pending'
    and p.current_prompt_id=v.prompt_id and p.assigned_at=v.assigned_at;
  if p_summary then return jsonb_build_object('ok',true,'incomingCount',v_count); end if;
  select jsonb_build_object('id',v.id,'status',v.status,'reviewerName',v.reviewer_name,'reviewerKey',v.reviewer_key,
    'missionId',v.prompt_id,'assignedAt',v.assigned_at) into v_own
  from party_missions.validations v join public.secret_mission_players p on p.id=v.player_id
  where p.player_key=p_player_key and p.current_prompt_id=v.prompt_id and p.assigned_at=v.assigned_at
    and v.status in ('pending','rejected') order by v.created_at desc limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'playerName',p.player_name,'text',v.prompt_text,
    'createdAt',v.created_at) order by v.created_at),'[]'::jsonb) into v_incoming
  from party_missions.validations v join public.secret_mission_players p on p.id=v.player_id
  where v.reviewer_key=p_player_key and v.status='pending'
    and p.current_prompt_id=v.prompt_id and p.assigned_at=v.assigned_at;
  return jsonb_build_object('ok',true,'open',party_missions.is_open(),'own',v_own,'incoming',v_incoming,'incomingCount',v_count);
end;
$$;

create function party_missions.request_check(p_player_key text,p_session_token uuid,p_mission_id uuid,
  p_assigned_at timestamptz,p_reviewer_key text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.secret_mission_players%rowtype; v party_missions.validations%rowtype; reviewer text; prompt text;
begin
  perform pg_advisory_xact_lock_shared(725260903203559);
  if party_identity.is_valid(p_player_key,p_session_token) is distinct from true then
    return jsonb_build_object('ok',false,'code','INVALID_SESSION'); end if;
  if not party_missions.is_open() then return jsonb_build_object('ok',false,'code','MISSIONS_CLOSED'); end if;
  if p_reviewer_key is not distinct from p_player_key then return jsonb_build_object('ok',false,'code','SELF_VALIDATION'); end if;
  reviewer:=public.private_secret_mission_player_name(p_reviewer_key);
  if reviewer is null then return jsonb_build_object('ok',false,'code','REVIEWER_UNAVAILABLE'); end if;
  select * into p from public.secret_mission_players where player_key=p_player_key for update;
  if not found or p.current_prompt_id is null or p.current_prompt_id is distinct from p_mission_id
    or p.assigned_at is distinct from p_assigned_at then return jsonb_build_object('ok',false,'code','STALE_MISSION'); end if;
  if p_request_id is null then return jsonb_build_object('ok',false,'code','INVALID_REQUEST'); end if;
  select * into v from party_missions.validations where id=p_request_id;
  if found then
    if v.player_id=p.id and v.prompt_id=p_mission_id and v.assigned_at=p_assigned_at and v.reviewer_key=p_reviewer_key then
      return jsonb_build_object('ok',true,'id',v.id,'status',v.status);
    end if;
    return jsonb_build_object('ok',false,'code','INVALID_REQUEST');
  end if;
  select * into v from party_missions.validations where player_id=p.id and status='pending';
  if found then
    if v.reviewer_key=p_reviewer_key then return jsonb_build_object('ok',true,'id',v.id,'status',v.status); end if;
    return jsonb_build_object('ok',false,'code','VALIDATION_PENDING');
  end if;
  if (select count(*) from party_missions.validations where player_id=p.id and created_at>clock_timestamp()-interval '1 minute')>=5 then
    return jsonb_build_object('ok',false,'code','RATE_LIMITED'); end if;
  select text into prompt from public.secret_mission_prompts where id=p_mission_id;
  if prompt is null then return jsonb_build_object('ok',false,'code','STALE_MISSION'); end if;
  insert into party_missions.validations(id,player_id,prompt_id,assigned_at,reviewer_key,reviewer_name,prompt_text)
    values(p_request_id,p.id,p_mission_id,p_assigned_at,p_reviewer_key,reviewer,prompt);
  return jsonb_build_object('ok',true,'id',p_request_id,'status','pending');
end;
$$;

create function party_missions.cancel_check(p_player_key text,p_session_token uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare player uuid;
begin
  perform pg_advisory_xact_lock_shared(725260903203559);
  if party_identity.is_valid(p_player_key,p_session_token) is distinct from true then
    return jsonb_build_object('ok',false,'code','INVALID_SESSION'); end if;
  select id into player from public.secret_mission_players where player_key=p_player_key for update;
  if not exists(select 1 from party_missions.validations where id=p_request_id and player_id=player) then
    return jsonb_build_object('ok',false,'code','INVALID_REQUEST'); end if;
  update party_missions.validations set status='cancelled',reviewed_at=clock_timestamp()
    where id=p_request_id and player_id=player and status='pending';
  return jsonb_build_object('ok',true);
end;
$$;

create function party_missions.decide_check(p_player_key text,p_session_token uuid,p_request_id uuid,p_approve boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v party_missions.validations%rowtype; p public.secret_mission_players%rowtype; author uuid;
begin
  perform pg_advisory_xact_lock_shared(725260903203559);
  if party_identity.is_valid(p_player_key,p_session_token) is distinct from true then
    return jsonb_build_object('ok',false,'code','INVALID_SESSION'); end if;
  if p_approve is null then return jsonb_build_object('ok',false,'code','INVALID_REQUEST'); end if;
  select player_id into author from party_missions.validations where id=p_request_id and reviewer_key=p_player_key;
  if author is null then return jsonb_build_object('ok',false,'code','NOT_REVIEWER'); end if;
  -- Always lock the author before the request, matching assignment changes and cancellation.
  select * into p from public.secret_mission_players where id=author for update;
  select * into v from party_missions.validations where id=p_request_id for update;
  if not found or p.id is null or v.reviewer_key is distinct from p_player_key then
    return jsonb_build_object('ok',false,'code','INVALID_REQUEST'); end if;
  if p.player_key=p_player_key then return jsonb_build_object('ok',false,'code','SELF_VALIDATION'); end if;
  if v.status<>'pending' then
    return jsonb_build_object('ok',v.status=case when p_approve then 'approved' else 'rejected' end,'code','ALREADY_RESOLVED'); end if;
  if not party_missions.is_open() then return jsonb_build_object('ok',false,'code','MISSIONS_CLOSED'); end if;
  if p.current_prompt_id is distinct from v.prompt_id or p.assigned_at is distinct from v.assigned_at then
    update party_missions.validations set status='cancelled',reviewed_at=clock_timestamp() where id=v.id;
    return jsonb_build_object('ok',false,'code','STALE_MISSION'); end if;
  update party_missions.validations set status=case when p_approve then 'approved' else 'rejected' end,
    reviewed_at=clock_timestamp() where id=v.id;
  if p_approve then
    insert into public.secret_mission_history(player_id,prompt_id,prompt_text,outcome)
      values(p.id,v.prompt_id,v.prompt_text,'completed');
    update public.secret_mission_players set completed_count=completed_count+1,current_prompt_id=null,assigned_at=null,
      updated_at=clock_timestamp() where id=p.id returning * into p;
    perform public.private_assign_secret_mission(p.id);
    insert into public.secret_mission_scoreboard(player_id,player_name,completed_count,updated_at)
      values(p.id,p.player_name,p.completed_count,clock_timestamp())
      on conflict(player_id) do update set player_name=excluded.player_name,completed_count=excluded.completed_count,updated_at=excluded.updated_at;
  end if;
  return jsonb_build_object('ok',true,'approved',p_approve);
end;
$$;

-- The old self-completion endpoint must never remain an alternate way to award points.
create or replace function public.complete_secret_mission(p_player_key text,p_session_token uuid,p_mission_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select jsonb_build_object('ok',false,'code','VALIDATION_REQUIRED');
$$;
create function public.get_secret_mission_checks(p_player_key text,p_session_token uuid,p_summary boolean default false)
returns jsonb language sql security invoker set search_path='' as $$ select party_missions.checks(p_player_key,p_session_token,p_summary); $$;
create function public.request_secret_mission_check(p_player_key text,p_session_token uuid,p_mission_id uuid,
  p_assigned_at timestamptz,p_reviewer_key text,p_request_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select party_missions.request_check(p_player_key,p_session_token,p_mission_id,p_assigned_at,p_reviewer_key,p_request_id); $$;
create function public.cancel_secret_mission_check(p_player_key text,p_session_token uuid,p_request_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select party_missions.cancel_check(p_player_key,p_session_token,p_request_id); $$;
create function public.decide_secret_mission_check(p_player_key text,p_session_token uuid,p_request_id uuid,p_approve boolean)
returns jsonb language sql security invoker set search_path='' as $$ select party_missions.decide_check(p_player_key,p_session_token,p_request_id,p_approve); $$;

revoke all on all functions in schema party_missions from public, anon, authenticated;
grant execute on function party_missions.checks(text,uuid,boolean),party_missions.request_check(text,uuid,uuid,timestamptz,text,uuid),
  party_missions.cancel_check(text,uuid,uuid),party_missions.decide_check(text,uuid,uuid,boolean) to anon,authenticated;
revoke all on function public.get_secret_mission_checks(text,uuid,boolean),public.request_secret_mission_check(text,uuid,uuid,timestamptz,text,uuid),
  public.cancel_secret_mission_check(text,uuid,uuid),public.decide_secret_mission_check(text,uuid,uuid,boolean) from public;
grant execute on function public.get_secret_mission_checks(text,uuid,boolean),public.request_secret_mission_check(text,uuid,uuid,timestamptz,text,uuid),
  public.cancel_secret_mission_check(text,uuid,uuid),public.decide_secret_mission_check(text,uuid,uuid,boolean) to anon,authenticated;

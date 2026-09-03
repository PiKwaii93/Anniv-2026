-- One guest-only conversation. No TV publication and no anonymous table access.
create schema party_chat;
revoke all on schema party_chat from public;
grant usage on schema party_chat to anon, authenticated;

create table party_chat.settings (
  id boolean primary key default true check (id),
  open boolean not null default true
);
insert into party_chat.settings(id) values(true);

create table party_chat.messages (
  id bigint generated always as identity primary key,
  player_key text not null,
  player_name text not null,
  request_id uuid not null,
  body text,
  created_at timestamptz not null default clock_timestamp(),
  deleted boolean not null default false,
  unique(player_key, request_id),
  check ((deleted and body is null) or (not deleted and body is not null and char_length(body) between 1 and 300))
);
create index chat_sender_time on party_chat.messages(player_key, created_at desc);
create index chat_visible_id on party_chat.messages(id desc) where not deleted;
create table party_chat.reads (
  player_key text primary key,
  last_id bigint not null default 0 check(last_id >= 0)
);
alter table party_chat.settings enable row level security;
alter table party_chat.messages enable row level security;
alter table party_chat.reads enable row level security;
revoke all on all tables in schema party_chat from public, anon, authenticated;
revoke all on all sequences in schema party_chat from public, anon, authenticated;

-- Privileged code stays in a non-exposed schema. Authorization is checked on
-- every call using the existing server-validated guest session or admin uid.
create function party_chat.state(p_player_key text, p_session_token uuid, p_admin boolean, p_summary boolean, p_before bigint)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_last bigint := 0; v_latest bigint; v_oldest bigint;
  v_unread integer := 0; v_messages jsonb := '[]'; v_open boolean;
begin
  if coalesce(p_admin,false) then
    if not exists(select 1 from public.app_admins where user_id=(select auth.uid())) then raise exception 'NOT_ADMIN'; end if;
  else
    perform party_extras.identity_name(p_player_key,p_session_token);
    select coalesce(last_id,0) into v_last from party_chat.reads where player_key=p_player_key;
    select count(*) into v_unread from party_chat.messages
      where id>coalesce(v_last,0) and not deleted and player_key<>p_player_key;
  end if;
  select coalesce(max(id),0) into v_latest from party_chat.messages;
  select open into v_open from party_chat.settings where id;
  if not coalesce(p_summary,false) then
    select coalesce(jsonb_agg(jsonb_build_object('id',m.id::text,'name',m.player_name,'body',m.body,
      'created_at',m.created_at,'mine',coalesce(m.player_key=p_player_key,false)) order by m.id),'[]'), min(m.id)
    into v_messages,v_oldest from (
      select * from party_chat.messages where not deleted and (p_before is null or id<p_before)
      order by id desc limit 50
    ) m;
  end if;
  return jsonb_build_object('messages',v_messages,'unread',v_unread,'latest',v_latest::text,
    'open',v_open,'oldest',v_oldest::text,
    'more',exists(select 1 from party_chat.messages where not deleted and id<v_oldest));
end;
$$;

create function party_chat.act(p_action text,p_payload jsonb,p_player_key text,p_session_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_name text; v_body text; v_request uuid; v_id bigint; v_open boolean;
  v_existing party_chat.messages%rowtype; v_now timestamptz;
begin
  if p_action like 'admin_%' then
    if not exists(select 1 from public.app_admins where user_id=(select auth.uid())) then raise exception 'NOT_ADMIN'; end if;
    if p_action='admin_pause' then
      if jsonb_typeof(p_payload->'paused') is distinct from 'boolean' then raise exception 'CHAT_INVALID_ACTION'; end if;
      update party_chat.settings set open=not (p_payload->>'paused')::boolean where id;
    elsif p_action='admin_delete' then
      update party_chat.messages set body=null,deleted=true where id=(p_payload->>'id')::bigint;
    else raise exception 'CHAT_INVALID_ACTION';
    end if;
    return jsonb_build_object('ok',true);
  end if;
  v_name:=party_extras.identity_name(p_player_key,p_session_token);
  if p_action='send' then
    v_body:=regexp_replace(coalesce(p_payload->>'body',''),'^[[:space:]]+|[[:space:]]+$','','g');
    if char_length(v_body) not between 1 and 300 or v_body !~ '[^[:space:]]' then raise exception 'CHAT_INVALID_BODY'; end if;
    v_request:=(p_payload->>'request_id')::uuid;
    if v_request is null then raise exception 'CHAT_INVALID_ACTION'; end if;
    -- This short lock makes quota checks and message ordering atomic, including
    -- simultaneous requests from several tabs. Pause takes the same row lock.
    select open into v_open from party_chat.settings where id for update;
    select * into v_existing from party_chat.messages where player_key=p_player_key and request_id=v_request;
    if found then
      if not v_existing.deleted and v_existing.body<>v_body then raise exception 'CHAT_REQUEST_CONFLICT'; end if;
      return jsonb_build_object('ok',true,'id',v_existing.id::text);
    end if;
    if not v_open then raise exception 'CHAT_PAUSED'; end if;
    v_now:=clock_timestamp();
    if exists(select 1 from party_chat.messages where player_key=p_player_key and created_at>v_now-interval '3 seconds')
      or (select count(*) from party_chat.messages where player_key=p_player_key and created_at>v_now-interval '1 minute')>=10
    then raise exception 'CHAT_RATE_LIMIT'; end if;
    insert into party_chat.messages(player_key,player_name,request_id,body,created_at)
      values(p_player_key,v_name,v_request,v_body,v_now) returning id into v_id;
    return jsonb_build_object('ok',true,'id',v_id::text);
  elsif p_action='delete' then
    update party_chat.messages set body=null,deleted=true where id=(p_payload->>'id')::bigint and player_key=p_player_key;
    if not found then raise exception 'CHAT_NOT_ALLOWED'; end if;
  elsif p_action='read' then
    select greatest(0,least(coalesce((p_payload->>'id')::bigint,0),coalesce(max(id),0))) into v_id from party_chat.messages;
    insert into party_chat.reads(player_key,last_id) values(p_player_key,v_id)
      on conflict(player_key) do update set last_id=greatest(party_chat.reads.last_id,excluded.last_id);
  else raise exception 'CHAT_INVALID_ACTION';
  end if;
  return jsonb_build_object('ok',true);
end;
$$;

revoke all on function party_chat.state(text,uuid,boolean,boolean,bigint) from public;
revoke all on function party_chat.act(text,jsonb,text,uuid) from public;
grant execute on function party_chat.state(text,uuid,boolean,boolean,bigint) to anon,authenticated;
grant execute on function party_chat.act(text,jsonb,text,uuid) to anon,authenticated;

create function public.get_party_chat(p_player_key text default null,p_session_token uuid default null,
  p_admin boolean default false,p_summary boolean default false,p_before bigint default null)
returns jsonb language sql stable security invoker set search_path='' as $$
  select party_chat.state(p_player_key,p_session_token,p_admin,p_summary,p_before);
$$;
create function public.party_chat_action(p_action text,p_payload jsonb default '{}',p_player_key text default null,p_session_token uuid default null)
returns jsonb language sql security invoker set search_path='' as $$
  select party_chat.act(p_action,p_payload,p_player_key,p_session_token);
$$;
revoke all on function public.get_party_chat(text,uuid,boolean,boolean,bigint) from public;
revoke all on function public.party_chat_action(text,jsonb,text,uuid) from public;
grant execute on function public.get_party_chat(text,uuid,boolean,boolean,bigint) to anon,authenticated;
grant execute on function public.party_chat_action(text,jsonb,text,uuid) to anon,authenticated;

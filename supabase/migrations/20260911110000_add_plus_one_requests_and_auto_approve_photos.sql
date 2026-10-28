create schema if not exists party_plus_one_requests;

revoke all on schema party_plus_one_requests from public;
grant usage on schema party_plus_one_requests to anon, authenticated;

create table party_plus_one_requests.requests (
  id uuid primary key,
  guest_id uuid not null references public.guests(id) on delete cascade,
  guest_name text not null,
  requested_name text not null check (
    char_length(btrim(requested_name)) between 1 and 80
  ),
  note text check (
    note is null or char_length(btrim(note)) <= 300
  ),
  status text not null default 'pending' check (
    status in ('pending', 'approved', 'rejected')
  ),
  plus_one_id uuid references public.plus_ones(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);

create unique index plus_one_requests_one_pending_per_guest_idx
  on party_plus_one_requests.requests (guest_id)
  where status = 'pending';

create index plus_one_requests_admin_queue_idx
  on party_plus_one_requests.requests (status, created_at desc);

alter table party_plus_one_requests.requests enable row level security;
revoke all on all tables in schema party_plus_one_requests from public, anon, authenticated;

create function party_plus_one_requests.state(
  p_player_key text,
  p_session_token uuid,
  p_admin boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin boolean := coalesce(p_admin, false);
  v_guest_id uuid;
  v_requests jsonb := '[]'::jsonb;
begin
  if v_admin then
    if not exists (
      select 1
      from public.app_admins a
      where a.user_id = (select auth.uid())
    ) then
      raise exception 'NOT_ADMIN';
    end if;
  else
    perform party_extras.identity_name(p_player_key, p_session_token);

    if p_player_key is null or p_player_key !~ '^guest:[0-9a-fA-F-]{36}$' then
      raise exception 'PLUS_ONE_GUEST_REQUIRED';
    end if;

    v_guest_id := substring(p_player_key from 7)::uuid;

    if not exists (
      select 1 from public.guests g where g.id = v_guest_id
    ) then
      raise exception 'PLUS_ONE_GUEST_REQUIRED';
    end if;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'guestId', r.guest_id,
        'guestName', r.guest_name,
        'requestedName', r.requested_name,
        'note', r.note,
        'status', r.status,
        'plusOneId', r.plus_one_id,
        'createdAt', r.created_at,
        'reviewedAt', r.reviewed_at
      )
      order by
        case when r.status = 'pending' then 0 else 1 end,
        r.created_at desc
    ),
    '[]'::jsonb
  )
  into v_requests
  from party_plus_one_requests.requests r
  where v_admin or r.guest_id = v_guest_id;

  return jsonb_build_object('ok', true, 'requests', v_requests);
end;
$$;

revoke all on function party_plus_one_requests.state(text, uuid, boolean)
  from public, anon, authenticated;

create function party_plus_one_requests.act(
  p_action text,
  p_payload jsonb,
  p_player_key text,
  p_session_token uuid,
  p_admin boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin boolean := coalesce(p_admin, false);
  v_guest_id uuid;
  v_guest_name text;
  v_request_id uuid;
  v_requested_name text;
  v_note text;
  v_request party_plus_one_requests.requests%rowtype;
  v_plus_one_id uuid;
begin
  if v_admin then
    if not exists (
      select 1
      from public.app_admins a
      where a.user_id = (select auth.uid())
    ) then
      raise exception 'NOT_ADMIN';
    end if;

    if p_action not in ('admin_approve', 'admin_reject') then
      raise exception 'PLUS_ONE_INVALID_ACTION';
    end if;

    v_request_id := (p_payload ->> 'request_id')::uuid;

    select *
    into v_request
    from party_plus_one_requests.requests r
    where r.id = v_request_id
    for update;

    if not found then
      return jsonb_build_object('ok', false, 'code', 'REQUEST_NOT_FOUND');
    end if;

    if v_request.status <> 'pending' then
      return jsonb_build_object('ok', false, 'code', 'REQUEST_ALREADY_REVIEWED');
    end if;

    if p_action = 'admin_approve' then
      insert into public.plus_ones (guest_id, name)
      values (v_request.guest_id, v_request.requested_name)
      returning id into v_plus_one_id;

      update party_plus_one_requests.requests
      set status = 'approved',
          plus_one_id = v_plus_one_id,
          reviewed_at = clock_timestamp(),
          reviewed_by = (select auth.uid())
      where id = v_request.id;
    else
      update party_plus_one_requests.requests
      set status = 'rejected',
          reviewed_at = clock_timestamp(),
          reviewed_by = (select auth.uid())
      where id = v_request.id;
    end if;

    return jsonb_build_object('ok', true);
  end if;

  v_guest_name := party_extras.identity_name(p_player_key, p_session_token);

  if p_player_key is null or p_player_key !~ '^guest:[0-9a-fA-F-]{36}$' then
    raise exception 'PLUS_ONE_GUEST_REQUIRED';
  end if;

  v_guest_id := substring(p_player_key from 7)::uuid;

  if not exists (
    select 1 from public.guests g where g.id = v_guest_id
  ) then
    raise exception 'PLUS_ONE_GUEST_REQUIRED';
  end if;

  if p_action = 'submit' then
    v_request_id := (p_payload ->> 'request_id')::uuid;
    v_requested_name := btrim(coalesce(p_payload ->> 'requested_name', ''));
    v_note := nullif(btrim(coalesce(p_payload ->> 'note', '')), '');

    if char_length(v_requested_name) not between 1 and 80 then
      return jsonb_build_object('ok', false, 'code', 'INVALID_NAME');
    end if;

    if v_note is not null and char_length(v_note) > 300 then
      return jsonb_build_object('ok', false, 'code', 'NOTE_TOO_LONG');
    end if;

    begin
      insert into party_plus_one_requests.requests (
        id, guest_id, guest_name, requested_name, note
      ) values (
        v_request_id, v_guest_id, v_guest_name, v_requested_name, v_note
      )
      on conflict (id) do nothing;
    exception
      when unique_violation then
        return jsonb_build_object('ok', false, 'code', 'PENDING_REQUEST_EXISTS');
    end;

    return jsonb_build_object('ok', true);
  elsif p_action = 'cancel' then
    v_request_id := (p_payload ->> 'request_id')::uuid;

    delete from party_plus_one_requests.requests r
    where r.id = v_request_id
      and r.guest_id = v_guest_id
      and r.status = 'pending';

    if not found then
      return jsonb_build_object('ok', false, 'code', 'REQUEST_NOT_FOUND');
    end if;

    return jsonb_build_object('ok', true);
  end if;

  raise exception 'PLUS_ONE_INVALID_ACTION';
end;
$$;

revoke all on function party_plus_one_requests.act(text, jsonb, text, uuid, boolean)
  from public, anon, authenticated;

create or replace function public.get_plus_one_requests(
  p_player_key text default null,
  p_session_token uuid default null,
  p_admin boolean default false
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select party_plus_one_requests.state(
    p_player_key,
    p_session_token,
    p_admin
  );
$$;

create or replace function public.plus_one_request_action(
  p_action text,
  p_payload jsonb default '{}'::jsonb,
  p_player_key text default null,
  p_session_token uuid default null,
  p_admin boolean default false
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select party_plus_one_requests.act(
    p_action,
    p_payload,
    p_player_key,
    p_session_token,
    p_admin
  );
$$;

revoke all on function public.get_plus_one_requests(text, uuid, boolean) from public;
revoke all on function public.plus_one_request_action(text, jsonb, text, uuid, boolean) from public;
grant execute on function public.get_plus_one_requests(text, uuid, boolean) to anon, authenticated;
grant execute on function public.plus_one_request_action(text, jsonb, text, uuid, boolean) to anon, authenticated;

alter table public.photo_hunt_submissions
  alter column status set default 'approved';

update public.photo_hunt_submissions
set status = 'approved',
    moderated_at = coalesce(moderated_at, clock_timestamp())
where status = 'pending';

create or replace function public.auto_approve_photo_hunt_submission()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.status := 'approved';
  new.moderated_at := coalesce(new.moderated_at, clock_timestamp());
  new.moderated_by := null;
  return new;
end;
$$;

revoke all on function public.auto_approve_photo_hunt_submission() from public;

drop trigger if exists photo_hunt_submissions_auto_approve
  on public.photo_hunt_submissions;

create trigger photo_hunt_submissions_auto_approve
before insert on public.photo_hunt_submissions
for each row execute function public.auto_approve_photo_hunt_submission();

create or replace function public.finalize_photo_hunt_upload(
  p_slot_id uuid,
  p_player_key text,
  p_session_token uuid,
  p_caption text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_name text;
  v_slot public.photo_hunt_upload_slots%rowtype;
  v_submission_id uuid;
begin
  if p_caption is not null and char_length(btrim(p_caption)) > 160 then
    return jsonb_build_object('ok', false, 'code', 'CAPTION_TOO_LONG');
  end if;

  v_player_name := public.photo_hunt_identity_name(p_player_key, p_session_token);
  if v_player_name is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SESSION');
  end if;

  select *
  into v_slot
  from public.photo_hunt_upload_slots s
  where s.id = p_slot_id
  for update;

  if not found
     or v_slot.player_key <> p_player_key
     or v_slot.used_at is not null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SLOT');
  end if;

  if v_slot.expires_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'SLOT_EXPIRED');
  end if;

  if not exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'photo-hunt'
      and o.name = v_slot.storage_path
  ) then
    return jsonb_build_object('ok', false, 'code', 'UPLOAD_MISSING');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'photo-hunt:' || p_player_key || ':' || v_slot.challenge_id::text,
      0
    )
  );

  if exists (
    select 1
    from public.photo_hunt_submissions s
    where s.player_key = p_player_key
      and s.challenge_id = v_slot.challenge_id
      and s.status in ('pending', 'approved')
  ) then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_SUBMITTED');
  end if;

  insert into public.photo_hunt_submissions (
    challenge_id,
    player_key,
    player_name,
    storage_path,
    mime_type,
    caption
  ) values (
    v_slot.challenge_id,
    p_player_key,
    v_player_name,
    v_slot.storage_path,
    v_slot.mime_type,
    nullif(btrim(p_caption), '')
  )
  returning id into v_submission_id;

  update public.photo_hunt_upload_slots
  set used_at = now()
  where id = p_slot_id;

  return jsonb_build_object(
    'ok', true,
    'submissionId', v_submission_id,
    'status', 'approved'
  );
end;
$$;

revoke all on function public.finalize_photo_hunt_upload(uuid, text, uuid, text)
  from public;
grant execute on function public.finalize_photo_hunt_upload(uuid, text, uuid, text)
  to anon, authenticated;

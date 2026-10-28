-- Party captains use their own Supabase Auth account. Existing administrators
-- become owners and keep the only access to role management and global resets.
alter table public.app_admins
  add column role text not null default 'owner',
  add column guest_id uuid references public.guests(id),
  add column created_by uuid references auth.users(id);

alter table public.app_admins
  add constraint app_admins_role_check
    check (role in ('owner', 'captain')),
  add constraint app_admins_captain_guest_check
    check (role = 'owner' or guest_id is not null);

create unique index app_admins_guest_id_unique
  on public.app_admins(guest_id)
  where guest_id is not null;

create table public.party_captain_invites (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references public.guests(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  revoked_at timestamptz
);

create index party_captain_invites_guest_idx
  on public.party_captain_invites(guest_id, created_at desc);

alter table public.party_captain_invites enable row level security;
revoke all on table public.party_captain_invites from public, anon, authenticated;
grant all on table public.party_captain_invites to service_role;

create or replace function public.is_party_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_admins a
    where a.user_id = (select auth.uid())
      and a.role = 'owner'
  );
$$;
revoke all on function public.is_party_owner() from public, anon;
grant execute on function public.is_party_owner() to authenticated;

create or replace function public.admin_list_party_captains()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not public.is_party_owner() then
    raise exception 'OWNER_REQUIRED' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'captains', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'userId', a.user_id,
          'guestId', a.guest_id,
          'guestName', g.name,
          'email', u.email,
          'createdAt', a.created_at
        ) order by g.name
      )
      from public.app_admins a
      join public.guests g on g.id = a.guest_id
      left join auth.users u on u.id = a.user_id
      where a.role = 'captain'
    ), '[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'guestId', i.guest_id,
          'guestName', g.name,
          'createdAt', i.created_at,
          'expiresAt', i.expires_at
        ) order by i.created_at desc
      )
      from public.party_captain_invites i
      join public.guests g on g.id = i.guest_id
      where i.accepted_at is null
        and i.revoked_at is null
        and i.expires_at > clock_timestamp()
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

create or replace function public.admin_create_party_captain_invite(
  p_guest_id uuid,
  p_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  guest_name text;
  invite_id uuid;
  invite_expires_at timestamptz := clock_timestamp() + interval '14 days';
  occupied_count integer;
begin
  if not public.is_party_owner() then
    raise exception 'OWNER_REQUIRED' using errcode = '42501';
  end if;
  if p_guest_id is null or p_token is null then
    raise exception 'INVALID_INVITE';
  end if;

  -- Serialize slot allocation so two simultaneous invitations cannot exceed
  -- the four-captain limit.
  perform pg_advisory_xact_lock(725260903204101);

  select g.name into guest_name
  from public.guests g
  where g.id = p_guest_id and g.status = 'confirmed';
  if guest_name is null then
    raise exception 'CONFIRMED_GUEST_REQUIRED';
  end if;
  if exists(select 1 from public.app_admins a where a.guest_id = p_guest_id) then
    raise exception 'ALREADY_CAPTAIN';
  end if;

  select count(*) into occupied_count
  from (
    select a.guest_id
    from public.app_admins a
    where a.role = 'captain'
    union
    select i.guest_id
    from public.party_captain_invites i
    where i.accepted_at is null
      and i.revoked_at is null
      and i.expires_at > clock_timestamp()
  ) occupied;
  if occupied_count >= 4 and not exists (
    select 1 from public.party_captain_invites i
    where i.guest_id = p_guest_id
      and i.accepted_at is null
      and i.revoked_at is null
      and i.expires_at > clock_timestamp()
  ) then
    raise exception 'CAPTAIN_LIMIT';
  end if;

  update public.party_captain_invites
  set revoked_at = clock_timestamp()
  where guest_id = p_guest_id
    and accepted_at is null
    and revoked_at is null;

  insert into public.party_captain_invites(
    guest_id, token_hash, created_by, expires_at
  ) values (
    p_guest_id,
    encode(sha256(convert_to(p_token::text, 'UTF8')), 'hex'),
    (select auth.uid()),
    invite_expires_at
  ) returning id into invite_id;

  return jsonb_build_object(
    'ok', true,
    'id', invite_id,
    'guestId', p_guest_id,
    'guestName', guest_name,
    'expiresAt', invite_expires_at
  );
end;
$$;

create or replace function public.accept_party_captain_invite(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite public.party_captain_invites%rowtype;
  guest_name text;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'PERMANENT_ACCOUNT_REQUIRED' using errcode = '42501';
  end if;
  if p_token is null then raise exception 'INVALID_INVITE'; end if;

  select * into invite
  from public.party_captain_invites i
  where i.token_hash = encode(sha256(convert_to(p_token::text, 'UTF8')), 'hex')
    and i.accepted_at is null
    and i.revoked_at is null
    and i.expires_at > clock_timestamp()
  for update;
  if not found then raise exception 'INVITE_EXPIRED'; end if;

  if exists (
    select 1 from public.app_admins a
    where a.user_id = (select auth.uid()) and a.role = 'owner'
  ) then
    raise exception 'OWNER_ACCOUNT';
  end if;

  insert into public.app_admins(user_id, role, guest_id, created_by)
  values((select auth.uid()), 'captain', invite.guest_id, invite.created_by)
  on conflict (user_id) do update
    set role = 'captain', guest_id = excluded.guest_id, created_by = excluded.created_by;

  update public.party_captain_invites
  set accepted_at = clock_timestamp(), accepted_by = (select auth.uid())
  where id = invite.id;

  select name into guest_name from public.guests where id = invite.guest_id;
  return jsonb_build_object('ok', true, 'guestId', invite.guest_id, 'guestName', guest_name);
end;
$$;

create or replace function public.admin_revoke_party_captain(p_guest_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare removed integer;
begin
  if not public.is_party_owner() then
    raise exception 'OWNER_REQUIRED' using errcode = '42501';
  end if;

  delete from public.app_admins
  where guest_id = p_guest_id and role = 'captain';
  get diagnostics removed = row_count;

  update public.party_captain_invites
  set revoked_at = coalesce(revoked_at, clock_timestamp())
  where guest_id = p_guest_id and revoked_at is null;

  return jsonb_build_object('ok', true, 'removed', removed);
end;
$$;

revoke all on function public.admin_list_party_captains() from public, anon;
revoke all on function public.admin_create_party_captain_invite(uuid, uuid) from public, anon;
revoke all on function public.accept_party_captain_invite(uuid) from public, anon;
revoke all on function public.admin_revoke_party_captain(uuid) from public, anon;
grant execute on function public.admin_list_party_captains() to authenticated;
grant execute on function public.admin_create_party_captain_invite(uuid, uuid) to authenticated;
grant execute on function public.accept_party_captain_invite(uuid) to authenticated;
grant execute on function public.admin_revoke_party_captain(uuid) to authenticated;

-- Captains can maintain guest details but only the owner can delete a guest.
drop policy if exists "Admins can delete guests" on public.guests;
create policy "Owner can delete guests"
on public.guests for delete to authenticated
using (public.is_party_owner());

-- Keep environment switching behind the owner role even if an authenticated
-- captain calls the RPC manually.
create or replace function public.admin_switch_party_environment(
  p_environment text,
  p_confirmation text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_party_owner() then
    raise exception 'OWNER_REQUIRED' using errcode = '42501';
  end if;
  return party_rehearsal.switch_environment(p_environment, p_confirmation);
end;
$$;

-- Wrap the existing reset implementation with an owner-only authorization
-- check. The legacy functions remain private to the schema.
alter function party_reset.status(uuid) rename to status_admin_legacy;
alter function party_reset.reset(uuid, text) rename to reset_admin_legacy;
alter function party_reset.ack_photos(uuid, text[]) rename to ack_photos_admin_legacy;

create function party_reset.status(p_request uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_party_owner() then raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;
  return party_reset.status_admin_legacy(p_request);
end;
$$;
create function party_reset.reset(p_request uuid, p_confirmation text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_party_owner() then raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;
  return party_reset.reset_admin_legacy(p_request, p_confirmation);
end;
$$;
create function party_reset.ack_photos(p_request uuid, p_paths text[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_party_owner() then raise exception 'OWNER_REQUIRED' using errcode='42501'; end if;
  return party_reset.ack_photos_admin_legacy(p_request, p_paths);
end;
$$;

revoke all on function party_reset.status_admin_legacy(uuid) from public, anon, authenticated;
revoke all on function party_reset.reset_admin_legacy(uuid, text) from public, anon, authenticated;
revoke all on function party_reset.ack_photos_admin_legacy(uuid, text[]) from public, anon, authenticated;
revoke all on function party_reset.status(uuid) from public, anon, authenticated;
revoke all on function party_reset.reset(uuid, text) from public, anon, authenticated;
revoke all on function party_reset.ack_photos(uuid, text[]) from public, anon, authenticated;
grant execute on function party_reset.status(uuid) to authenticated;
grant execute on function party_reset.reset(uuid, text) to authenticated;
grant execute on function party_reset.ack_photos(uuid, text[]) to authenticated;

create or replace function public.admin_party_reset_status(p_request uuid default null) returns jsonb
language sql stable security invoker set search_path='' as $$ select party_reset.status(p_request); $$;
create or replace function public.admin_reset_party_data(p_request uuid,p_confirmation text) returns jsonb
language sql security invoker set search_path='' as $$ select party_reset.reset(p_request,p_confirmation); $$;
create or replace function public.admin_ack_party_reset_photos(p_request uuid,p_paths text[]) returns jsonb
language sql security invoker set search_path='' as $$ select party_reset.ack_photos(p_request,p_paths); $$;

notify pgrst, 'reload schema';

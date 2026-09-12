-- A confirmed guest can leave the confirmed state while their credentials are
-- revoked. Deletion must keep working through the same trigger function.
begin;
set local plpgsql.check_asserts = on;

do $$
declare
  guest_id uuid := gen_random_uuid();
  deleted_guest_id uuid := gen_random_uuid();
  guest_token uuid := gen_random_uuid();
  deleted_guest_token uuid := gen_random_uuid();
  admin_id uuid;
begin
  select user_id into admin_id from public.app_admins limit 1;
  assert admin_id is not null, 'Admin fixture required';

  insert into public.guests(id, name, status) values
    (guest_id, 'QA Status Change', 'confirmed'),
    (deleted_guest_id, 'QA Status Delete', 'confirmed');

  insert into public.party_identity_sessions(player_key, player_name, session_token) values
    ('guest:' || guest_id::text, 'QA Status Change', guest_token),
    ('guest:' || deleted_guest_id::text, 'QA Status Delete', deleted_guest_token);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);

  update public.guests
  set status = 'maybe'
  where id = guest_id;

  delete from public.guests
  where id = deleted_guest_id;

  reset role;

  assert (select status from public.guests where id = guest_id) = 'maybe',
    'The BEFORE UPDATE trigger must preserve the new status';
  assert not exists(
    select 1 from public.party_identity_sessions
    where player_key = 'guest:' || guest_id::text
  ), 'Losing confirmed status revokes the guest session';
  assert not exists(
    select 1 from public.guests where id = deleted_guest_id
  ), 'The shared trigger must still allow deletion';
  assert not exists(
    select 1 from public.party_identity_sessions
    where player_key = 'guest:' || deleted_guest_id::text
  ), 'Deleting a guest still revokes their session';
end;
$$;

rollback;

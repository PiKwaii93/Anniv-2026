-- Verify the security audit corrections without retaining fixture data.
begin;
set local plpgsql.check_asserts = on;
set local lock_timeout = '3s';
set local statement_timeout = '20s';

do $$
declare
  guest_id uuid := gen_random_uuid();
  plus_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  guest_token uuid := gen_random_uuid();
  plus_token uuid := gen_random_uuid();
  other_token uuid := gen_random_uuid();
  guest_key text := 'guest:' || guest_id;
  plus_key text := 'plus:' || plus_id;
  other_key text := 'guest:' || other_id;
  admin_id uuid;
  denied boolean;
begin
  select user_id into admin_id from public.app_admins limit 1;
  assert admin_id is not null;

  assert (
    select proconfig = array['search_path=""']
    from pg_proc where oid = 'public.set_beer_pong_updated_at()'::regprocedure
  ), 'Beer Pong timestamp trigger must use an empty search_path';
  assert (
    select proconfig = array['search_path=""']
    from pg_proc where oid = 'public.set_iceberg_entry_updated_at()'::regprocedure
  ), 'Iceberg timestamp trigger must use an empty search_path';
  assert not exists (
    select 1 from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name in (
        'set_beer_pong_updated_at',
        'set_iceberg_entry_updated_at',
        'photo_hunt_identity_name'
      )
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ), 'Internal helpers must not be callable through API roles';

  insert into public.guests(id, name, status) values
    (guest_id, 'QA Status Loss', 'confirmed'),
    (other_id, 'QA Unrelated Identity', 'confirmed');
  insert into public.plus_ones(id, guest_id, name)
  values (plus_id, guest_id, 'QA Status Plus One');

  assert public.claim_party_identity(guest_key, guest_token)->>'ok' = 'true';
  assert public.claim_live_vote_identity(guest_key, guest_token)->>'ok' = 'true';
  assert public.claim_secret_mission(guest_key, guest_token)->>'ok' = 'true';
  assert public.claim_party_identity(plus_key, plus_token)->>'ok' = 'true';
  assert public.claim_live_vote_identity(plus_key, plus_token)->>'ok' = 'true';
  assert public.claim_secret_mission(plus_key, plus_token)->>'ok' = 'true';
  assert public.claim_party_identity(other_key, other_token)->>'ok' = 'true';

  assert public.photo_hunt_identity_name(guest_key, guest_token) = 'QA Status Loss';
  assert party_extras.identity_name(guest_key, guest_token) = 'QA Status Loss';

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  denied := false;
  begin
    perform public.photo_hunt_identity_name(guest_key, guest_token);
  exception when insufficient_privilege then
    denied := true;
  end;
  assert denied, 'Authenticated clients cannot call the internal Photo Hunt helper';
  update public.guests set status = 'declined' where id = guest_id;
  reset role;

  assert not exists (
    select 1 from public.party_identity_sessions
    where player_key in (guest_key, plus_key)
  ), 'Status loss must remove guest and plus-one central sessions';
  assert (
    select count(*) = 2 from party_identity.revoked_tokens
    where session_token in (guest_token, plus_token)
  ), 'Status loss must revoke guest and plus-one tokens';
  assert public.get_live_vote_player_state(guest_key, guest_token)->>'code' = 'INVALID_SESSION';
  assert public.get_secret_mission_state(plus_key, plus_token)->>'code' = 'INVALID_SESSION';
  assert public.photo_hunt_identity_name(guest_key, guest_token) is null;

  denied := false;
  begin
    perform party_extras.identity_name(guest_key, guest_token);
  exception when insufficient_privilege then
    denied := true;
  end;
  assert denied, 'Revoked identity must lose chat and extras access';
  assert public.party_identity_is_valid(other_key, other_token),
    'Unrelated identity must remain valid';
end;
$$;

rollback;

-- Verify that deleting an invite revokes credentials without erasing game history.
begin;
set local plpgsql.check_asserts = on;
set local lock_timeout = '3s';
set local statement_timeout = '20s';

do $$
declare
  guest_id uuid := gen_random_uuid();
  plus_id uuid := gen_random_uuid();
  cascade_plus_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  guest_token uuid := gen_random_uuid();
  plus_token uuid := gen_random_uuid();
  cascade_plus_token uuid := gen_random_uuid();
  other_token uuid := gen_random_uuid();
  guest_key text := 'guest:' || guest_id;
  plus_key text := 'plus:' || plus_id;
  cascade_plus_key text := 'plus:' || cascade_plus_id;
  other_key text := 'guest:' || other_id;
  admin_id uuid;
begin
  select user_id into admin_id from public.app_admins limit 1;
  assert admin_id is not null;

  insert into public.guests(id, name, status) values
    (guest_id, 'QA Deleted Guest', 'confirmed'),
    (other_id, 'QA Unrelated Guest', 'confirmed');
  insert into public.plus_ones(id, guest_id, name) values
    (plus_id, guest_id, 'QA Deleted Plus One'),
    (cascade_plus_id, guest_id, 'QA Cascaded Plus One');

  assert public.claim_party_identity(guest_key, guest_token)->>'ok' = 'true';
  assert public.claim_live_vote_identity(guest_key, guest_token)->>'ok' = 'true';
  assert public.claim_secret_mission(guest_key, guest_token)->>'ok' = 'true';
  assert public.claim_party_identity(plus_key, plus_token)->>'ok' = 'true';
  assert public.claim_live_vote_identity(plus_key, plus_token)->>'ok' = 'true';
  assert public.claim_secret_mission(plus_key, plus_token)->>'ok' = 'true';
  assert public.claim_party_identity(cascade_plus_key, cascade_plus_token)->>'ok' = 'true';
  assert public.claim_live_vote_identity(cascade_plus_key, cascade_plus_token)->>'ok' = 'true';
  assert public.claim_secret_mission(cascade_plus_key, cascade_plus_token)->>'ok' = 'true';
  assert public.claim_party_identity(other_key, other_token)->>'ok' = 'true';
  assert public.claim_live_vote_identity(other_key, other_token)->>'ok' = 'true';
  assert public.claim_secret_mission(other_key, other_token)->>'ok' = 'true';

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  delete from public.plus_ones where id = plus_id;
  reset role;

  assert not exists (
    select 1 from public.party_identity_sessions where player_key = plus_key
  ), 'Direct plus-one deletion must remove its central session';
  assert exists (
    select 1 from party_identity.revoked_tokens where session_token = plus_token
  ), 'Direct plus-one deletion must revoke its token';
  assert exists (
    select 1 from public.live_vote_players
    where player_key = plus_key and session_token <> plus_token
  ), 'Direct plus-one deletion must rotate its Vote Room token';
  assert exists (
    select 1 from public.secret_mission_players
    where player_key = plus_key and session_token <> plus_token
  ), 'Direct plus-one deletion must rotate its Missions token';
  assert public.get_live_vote_player_state(plus_key, plus_token)->>'code' = 'INVALID_SESSION',
    'Deleted plus-one must lose Vote Room access immediately';
  assert public.get_secret_mission_state(plus_key, plus_token)->>'code' = 'INVALID_SESSION',
    'Deleted plus-one must lose Missions access immediately';
  assert exists (
    select 1 from public.party_identity_sessions
    where player_key = guest_key and session_token = guest_token
  ), 'Deleting a plus-one must not disconnect the host guest';

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  delete from public.guests where id = guest_id;
  reset role;

  assert not exists (
    select 1 from public.party_identity_sessions
    where player_key in (guest_key, cascade_plus_key)
  ), 'Guest deletion must remove guest and cascaded plus-one sessions';
  assert exists (
    select 1 from party_identity.revoked_tokens where session_token = guest_token
  ), 'Guest deletion must revoke the guest token';
  assert exists (
    select 1 from party_identity.revoked_tokens where session_token = cascade_plus_token
  ), 'Guest deletion must revoke cascaded plus-one tokens';
  assert exists (
    select 1 from public.live_vote_players
    where player_key = guest_key and session_token <> guest_token
  ), 'Guest Vote Room history must survive with a rotated token';
  assert exists (
    select 1 from public.secret_mission_players
    where player_key = cascade_plus_key and session_token <> cascade_plus_token
  ), 'Plus-one Missions history must survive with a rotated token';
  assert public.get_live_vote_player_state(guest_key, guest_token)->>'code' = 'INVALID_SESSION',
    'Deleted guest must lose Vote Room access immediately';
  assert public.get_secret_mission_state(cascade_plus_key, cascade_plus_token)->>'code' = 'INVALID_SESSION',
    'Cascaded plus-one must lose Missions access immediately';
  assert exists (
    select 1 from public.party_identity_sessions
    where player_key = other_key and session_token = other_token
  ), 'Unrelated sessions must remain untouched';
  assert exists (
    select 1 from public.live_vote_players
    where player_key = other_key and session_token = other_token
  ), 'Unrelated Vote Room credentials must remain untouched';
  assert exists (
    select 1 from public.secret_mission_players
    where player_key = other_key and session_token = other_token
  ), 'Unrelated Missions credentials must remain untouched';
end;
$$;

rollback;

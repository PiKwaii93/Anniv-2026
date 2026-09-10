-- The same revocation trigger runs before DELETE and before a confirmed guest
-- loses that status. A BEFORE UPDATE trigger must return NEW; returning OLD
-- silently restores the previous status.
create or replace function party_identity.revoke_deleted_guest_sessions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_keys text[];
begin
  select array['guest:' || old.id::text]
         || coalesce(
              array_agg('plus:' || plus_one.id::text)
                filter (where plus_one.id is not null),
              array[]::text[]
            )
  into v_player_keys
  from public.plus_ones as plus_one
  where plus_one.guest_id = old.id;

  perform party_identity.revoke_player_keys(v_player_keys);

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function party_identity.revoke_deleted_guest_sessions()
from public, anon, authenticated;

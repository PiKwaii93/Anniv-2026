-- The two legacy timestamp trigger functions only touch NEW, so an empty
-- search_path is sufficient and prevents object-shadowing surprises.
alter function public.set_beer_pong_updated_at() set search_path = '';
alter function public.set_iceberg_entry_updated_at() set search_path = '';

-- Trigger functions are invoked by PostgreSQL itself and are not RPCs.
revoke all on function public.set_beer_pong_updated_at()
from public, anon, authenticated;
revoke all on function public.set_iceberg_entry_updated_at()
from public, anon, authenticated;

-- Use the central validity rule for every feature that shares the global guest
-- identity. This includes current guest eligibility and token revocation.
create or replace function party_extras.identity_name(
  p_player_key text,
  p_session_token uuid
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_name text;
begin
  if party_identity.is_valid(p_player_key, p_session_token) is distinct from true then
    raise exception 'IDENTITY_REQUIRED' using errcode = '42501';
  end if;

  select identity_session.player_name
  into v_name
  from public.party_identity_sessions as identity_session
  where identity_session.player_key = p_player_key
    and identity_session.session_token = p_session_token;

  if v_name is null then
    raise exception 'IDENTITY_REQUIRED' using errcode = '42501';
  end if;

  return v_name;
end;
$$;

create or replace function public.photo_hunt_identity_name(
  p_player_key text,
  p_session_token uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select identity_session.player_name
  from public.party_identity_sessions as identity_session
  where identity_session.player_key = p_player_key
    and identity_session.session_token = p_session_token
    and party_identity.is_valid(p_player_key, p_session_token)
  limit 1;
$$;

-- This helper is called only from privileged Photo Hunt functions. Supabase's
-- default function grants had also exposed it as a standalone anonymous RPC.
revoke all on function public.photo_hunt_identity_name(text, uuid)
from public, anon, authenticated;

-- A guest who is no longer confirmed must lose the same credentials as a
-- deleted guest, including every attached plus-one identity.
drop trigger if exists guests_revoke_identity_before_status_loss on public.guests;
create trigger guests_revoke_identity_before_status_loss
before update of status on public.guests
for each row
when (old.status = 'confirmed' and new.status is distinct from 'confirmed')
execute function party_identity.revoke_deleted_guest_sessions();

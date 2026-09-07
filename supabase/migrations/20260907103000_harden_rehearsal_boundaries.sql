-- Guest catalogs are mutable party data. Only the active environment can be
-- reconstructed from the active tables. Seed that slot from the current
-- catalog and seed the inactive slot empty so rehearsal guests can never leak
-- into the real event (or the reverse).
with active_environment as (
  select environment from public.party_state where id = 'main'
), guest_catalog as (
  select jsonb_build_object(
    'guests', coalesce((select jsonb_agg(to_jsonb(t)) from public.guests t), '[]'::jsonb),
    'plus_ones', coalesce((select jsonb_agg(to_jsonb(t)) from public.plus_ones t), '[]'::jsonb),
    'guest_private_notes', coalesce((select jsonb_agg(to_jsonb(t)) from public.guest_private_notes t), '[]'::jsonb)
  ) as payload
)
update party_rehearsal.slots slot
set payload = slot.payload || case
  when slot.environment = (select environment from active_environment)
    then (select payload from guest_catalog)
  else jsonb_build_object(
    'guests', '[]'::jsonb,
    'plus_ones', '[]'::jsonb,
    'guest_private_notes', '[]'::jsonb
  )
end
where not (slot.payload ? 'guests');

alter function party_rehearsal.capture_active() rename to capture_active_without_guest_catalog;
alter function party_rehearsal.restore_slot(jsonb, text) rename to restore_slot_without_guest_catalog;

create function party_rehearsal.capture_active() returns jsonb
language sql stable security definer set search_path = '' as $$
  select party_rehearsal.capture_active_without_guest_catalog() || jsonb_build_object(
    'guests', coalesce((select jsonb_agg(to_jsonb(t)) from public.guests t), '[]'::jsonb),
    'plus_ones', coalesce((select jsonb_agg(to_jsonb(t)) from public.plus_ones t), '[]'::jsonb),
    'guest_private_notes', coalesce((select jsonb_agg(to_jsonb(t)) from public.guest_private_notes t), '[]'::jsonb)
  );
$$;

create function party_rehearsal.restore_slot(payload jsonb, target_environment text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform party_rehearsal.restore_slot_without_guest_catalog(payload, target_environment);

  delete from public.guest_private_notes where guest_id is not null;
  delete from public.plus_ones where id is not null;
  delete from public.guests where id is not null;

  insert into public.guests
    select * from jsonb_populate_recordset(null::public.guests, coalesce(payload -> 'guests', '[]'::jsonb));
  insert into public.plus_ones
    select * from jsonb_populate_recordset(null::public.plus_ones, coalesce(payload -> 'plus_ones', '[]'::jsonb));
  insert into public.guest_private_notes
    select * from jsonb_populate_recordset(null::public.guest_private_notes, coalesce(payload -> 'guest_private_notes', '[]'::jsonb));
end;
$$;

revoke all on function party_rehearsal.capture_active() from public, anon, authenticated;
revoke all on function party_rehearsal.restore_slot(jsonb, text) from public, anon, authenticated;

-- Practical details are global. Protect the real event record from accidental
-- edits while the application is in rehearsal mode.
create function party_info.require_live_environment() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if (select environment from public.party_state where id = 'main') is distinct from 'live' then
    raise exception 'LIVE_ENVIRONMENT_REQUIRED';
  end if;
  return new;
end;
$$;
revoke all on function party_info.require_live_environment() from public, anon, authenticated;
create trigger party_event_info_require_live_environment
before update on public.party_event_info
for each row execute function party_info.require_live_environment();

-- The Spotify bridge talks to the real account. Refuse to acquire its lease in
-- rehearsal, before an Edge Function can call Spotify.
alter function party_extras.spotify_bridge(uuid, text, jsonb, uuid)
  rename to spotify_bridge_without_environment_guard;
create function party_extras.spotify_bridge(p_admin_id uuid, p_op text, p_payload jsonb, p_lease uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_op = 'acquire' and (select environment from public.party_state where id = 'main') = 'rehearsal' then
    raise exception 'REHEARSAL_SPOTIFY_DISABLED';
  end if;
  return party_extras.spotify_bridge_without_environment_guard(p_admin_id, p_op, p_payload, p_lease);
end;
$$;
revoke all on function party_extras.spotify_bridge(uuid, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function party_extras.spotify_bridge(uuid, text, jsonb, uuid) to service_role;

alter function party_extras.spotify_guest_bridge(jsonb, text, jsonb, uuid)
  rename to spotify_guest_bridge_without_environment_guard;
create function party_extras.spotify_guest_bridge(p_identity jsonb, p_op text, p_payload jsonb, p_lease uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_op = 'acquire' and (select environment from public.party_state where id = 'main') = 'rehearsal' then
    raise exception 'REHEARSAL_SPOTIFY_DISABLED';
  end if;
  return party_extras.spotify_guest_bridge_without_environment_guard(p_identity, p_op, p_payload, p_lease);
end;
$$;
revoke all on function party_extras.spotify_guest_bridge(jsonb, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function party_extras.spotify_guest_bridge(jsonb, text, jsonb, uuid) to service_role;

notify pgrst, 'reload schema';

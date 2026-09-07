-- Practical event details are global configuration, shared by live and rehearsal.
create schema if not exists party_info;
revoke all on schema party_info from public, anon, authenticated;

create table public.party_event_info (
  id text primary key default 'main' check (id = 'main'),
  event_at timestamptz not null,
  venue_name text not null default '' check (char_length(venue_name) <= 80),
  address text not null default '' check (char_length(address) <= 240),
  access_notes text not null default '' check (char_length(access_notes) <= 500),
  dress_code text not null default '' check (char_length(dress_code) <= 160),
  parking_notes text not null default '' check (char_length(parking_notes) <= 300),
  other_notes text not null default '' check (char_length(other_notes) <= 500),
  updated_at timestamptz not null default clock_timestamp()
);

insert into public.party_event_info (id, event_at)
values ('main', '2026-10-24 19:30:00+00');

alter table public.party_event_info enable row level security;
revoke all on table public.party_event_info from public, anon, authenticated;
grant select on table public.party_event_info to anon, authenticated;
grant update (event_at, venue_name, address, access_notes, dress_code, parking_notes, other_notes)
  on table public.party_event_info to authenticated;

create function party_info.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_admins where user_id = (select auth.uid()));
$$;

create function party_info.touch_updated_at() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

revoke all on all functions in schema party_info from public, anon, authenticated;
grant usage on schema party_info to authenticated;
grant execute on function party_info.is_admin() to authenticated;

create policy "Practical event details are public" on public.party_event_info
for select to anon, authenticated using (true);
create policy "Only admins update practical event details" on public.party_event_info
for update to authenticated
using ((select party_info.is_admin()))
with check (id = 'main' and (select party_info.is_admin()));

create trigger party_event_info_touch_updated_at
before update on public.party_event_info
for each row execute function party_info.touch_updated_at();

notify pgrst, 'reload schema';

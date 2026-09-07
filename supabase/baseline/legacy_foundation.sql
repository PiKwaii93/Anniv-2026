-- Legacy foundation captured from the production schema on 2026-09-07.
--
-- This file is intentionally outside supabase/migrations: production already had
-- these objects before its first recorded migration (20260828205421). Apply it
-- only to an empty Supabase project, before applying the recorded migrations.
-- It contains no production guests, private notes, iceberg content, or admin IDs.

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  status text not null default 'invited'
    check (status in ('invited', 'confirmed', 'maybe', 'declined')),
  created_at timestamptz not null default now()
);

create table public.plus_ones (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references public.guests(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index plus_ones_guest_id_idx on public.plus_ones (guest_id);

create table public.guest_private_notes (
  guest_id uuid primary key references public.guests(id) on delete cascade,
  notes text not null default ''
);

create table public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.beer_pong_state (
  id text primary key check (id = 'main'),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  updated_at timestamptz not null default now()
);

create function public.set_beer_pong_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger beer_pong_state_set_updated_at
before update on public.beer_pong_state
for each row execute function public.set_beer_pong_updated_at();

insert into public.beer_pong_state (id, state)
values (
  'main',
  '{"selectedPlayerIds":[],"playerSnapshots":[],"teams":[],"draftMode":"random","draftValidated":false,"rounds":[],"championTeamId":null}'::jsonb
);

create table public.iceberg_entries (
  id uuid primary key default gen_random_uuid(),
  level smallint not null check (level >= 1 and level <= 5),
  title text not null check (char_length(trim(title)) > 0),
  description text not null default '',
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index iceberg_entries_level_order_idx
  on public.iceberg_entries (level, sort_order, created_at);

create function public.set_iceberg_entry_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger iceberg_entries_set_updated_at
before update on public.iceberg_entries
for each row execute function public.set_iceberg_entry_updated_at();

alter table public.guests enable row level security;
alter table public.plus_ones enable row level security;
alter table public.guest_private_notes enable row level security;
alter table public.app_admins enable row level security;
alter table public.beer_pong_state enable row level security;
alter table public.iceberg_entries enable row level security;

create policy "Users can read their own admin status"
on public.app_admins for select to authenticated
using (user_id = auth.uid());

create policy "Public can read confirmed guests"
on public.guests for select to anon, authenticated
using (status = 'confirmed');
create policy "Admins can read all guests"
on public.guests for select to authenticated
using (exists (select 1 from public.app_admins where user_id = auth.uid()));
create policy "Admins can insert guests"
on public.guests for insert to authenticated
with check (exists (select 1 from public.app_admins where user_id = auth.uid()));
create policy "Admins can update guests"
on public.guests for update to authenticated
using (exists (select 1 from public.app_admins where user_id = auth.uid()))
with check (exists (select 1 from public.app_admins where user_id = auth.uid()));
create policy "Admins can delete guests"
on public.guests for delete to authenticated
using (exists (select 1 from public.app_admins where user_id = auth.uid()));

create policy "Public can read plus ones of confirmed guests"
on public.plus_ones for select to anon, authenticated
using (exists (
  select 1 from public.guests
  where guests.id = plus_ones.guest_id and guests.status = 'confirmed'
));
create policy "Admins can read all plus ones"
on public.plus_ones for select to authenticated
using (exists (select 1 from public.app_admins where user_id = auth.uid()));
create policy "Admins can insert plus ones"
on public.plus_ones for insert to authenticated
with check (exists (select 1 from public.app_admins where user_id = auth.uid()));
create policy "Admins can update plus ones"
on public.plus_ones for update to authenticated
using (exists (select 1 from public.app_admins where user_id = auth.uid()))
with check (exists (select 1 from public.app_admins where user_id = auth.uid()));
create policy "Admins can delete plus ones"
on public.plus_ones for delete to authenticated
using (exists (select 1 from public.app_admins where user_id = auth.uid()));

create policy "Admins can read private notes"
on public.guest_private_notes for select to authenticated
using (exists (select 1 from public.app_admins where user_id = auth.uid()));
create policy "Admins can insert private notes"
on public.guest_private_notes for insert to authenticated
with check (exists (select 1 from public.app_admins where user_id = auth.uid()));
create policy "Admins can update private notes"
on public.guest_private_notes for update to authenticated
using (exists (select 1 from public.app_admins where user_id = auth.uid()))
with check (exists (select 1 from public.app_admins where user_id = auth.uid()));
create policy "Admins can delete private notes"
on public.guest_private_notes for delete to authenticated
using (exists (select 1 from public.app_admins where user_id = auth.uid()));

create policy "Public can read beer pong"
on public.beer_pong_state for select to anon, authenticated using (true);
create policy "Admins can insert beer pong"
on public.beer_pong_state for insert to authenticated
with check (exists (select 1 from public.app_admins where user_id = auth.uid()));
create policy "Admins can update beer pong"
on public.beer_pong_state for update to authenticated
using (exists (select 1 from public.app_admins where user_id = auth.uid()))
with check (exists (select 1 from public.app_admins where user_id = auth.uid()));
create policy "Admins can delete beer pong"
on public.beer_pong_state for delete to authenticated
using (exists (select 1 from public.app_admins where user_id = auth.uid()));

create policy "Public can read published iceberg entries"
on public.iceberg_entries for select to anon, authenticated
using (is_published = true);
create policy "Admins can read all iceberg entries"
on public.iceberg_entries for select to authenticated
using (exists (select 1 from public.app_admins where user_id = auth.uid()));
create policy "Admins can insert iceberg entries"
on public.iceberg_entries for insert to authenticated
with check (exists (select 1 from public.app_admins where user_id = auth.uid()));
create policy "Admins can update iceberg entries"
on public.iceberg_entries for update to authenticated
using (exists (select 1 from public.app_admins where user_id = auth.uid()))
with check (exists (select 1 from public.app_admins where user_id = auth.uid()));
create policy "Admins can delete iceberg entries"
on public.iceberg_entries for delete to authenticated
using (exists (select 1 from public.app_admins where user_id = auth.uid()));

revoke all on table public.guests, public.plus_ones, public.guest_private_notes,
  public.app_admins, public.beer_pong_state, public.iceberg_entries from anon, authenticated;
grant select on table public.guests, public.plus_ones, public.beer_pong_state,
  public.iceberg_entries to anon;
grant select, insert, update, delete on table public.guests, public.plus_ones,
  public.guest_private_notes, public.beer_pong_state, public.iceberg_entries to authenticated;
grant select on table public.app_admins to authenticated;
grant all on table public.guests, public.plus_ones, public.guest_private_notes,
  public.app_admins, public.beer_pong_state, public.iceberg_entries to service_role;

alter publication supabase_realtime add table public.guests;
alter publication supabase_realtime add table public.plus_ones;
alter publication supabase_realtime add table public.beer_pong_state;
alter publication supabase_realtime add table public.iceberg_entries;

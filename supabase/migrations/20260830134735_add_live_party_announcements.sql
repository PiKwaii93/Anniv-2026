create table if not exists public.party_announcements (
  id text primary key check (id = 'main'),
  message text not null default '' check (char_length(message) <= 240),
  kind text not null default 'info' check (kind in ('info', 'food', 'photo', 'game', 'urgent')),
  is_active boolean not null default false,
  expires_at timestamptz,
  event_id uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now()
);

insert into public.party_announcements (id)
values ('main')
on conflict (id) do nothing;

alter table public.party_announcements enable row level security;

drop policy if exists "Public can read party announcement" on public.party_announcements;
create policy "Public can read party announcement"
on public.party_announcements
for select
to anon, authenticated
using (id = 'main');

drop policy if exists "Admins can update party announcement" on public.party_announcements;
create policy "Admins can update party announcement"
on public.party_announcements
for update
to authenticated
using (
  exists (
    select 1
    from public.app_admins
    where app_admins.user_id = (select auth.uid())
  )
)
with check (
  id = 'main'
  and exists (
    select 1
    from public.app_admins
    where app_admins.user_id = (select auth.uid())
  )
);

revoke insert, delete on public.party_announcements from anon, authenticated;
grant select on public.party_announcements to anon, authenticated;
grant update on public.party_announcements to authenticated;

alter publication supabase_realtime add table public.party_announcements;

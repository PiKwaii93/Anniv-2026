create table if not exists public.party_state (
  id text primary key check (id = 'main'),
  phase text not null default 'preparation' check (phase in ('preparation','live','ended')),
  featured_module text check (featured_module is null or featured_module in ('iceberg','beer-pong','bingo','guests')),
  iceberg_visible boolean not null default true,
  beer_pong_visible boolean not null default true,
  bingo_visible boolean not null default true,
  guests_visible boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.party_state enable row level security;

create policy "Public can read party state"
on public.party_state
for select
to anon, authenticated
using (id = 'main');

create policy "Admins can update party state"
on public.party_state
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

insert into public.party_state (
  id,
  phase,
  featured_module,
  iceberg_visible,
  beer_pong_visible,
  bingo_visible,
  guests_visible
)
values ('main','preparation',null,true,true,true,true)
on conflict (id) do nothing;

do $$
begin
  alter publication supabase_realtime add table public.party_state;
exception
  when duplicate_object then null;
end $$;

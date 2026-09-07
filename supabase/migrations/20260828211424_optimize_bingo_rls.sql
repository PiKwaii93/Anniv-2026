drop policy if exists "Public can read active bingo prompts" on public.bingo_prompts;
drop policy if exists "Admins can read all bingo prompts" on public.bingo_prompts;
drop policy if exists "Admins can insert bingo prompts" on public.bingo_prompts;
drop policy if exists "Admins can update bingo prompts" on public.bingo_prompts;
drop policy if exists "Admins can delete bingo prompts" on public.bingo_prompts;

create policy "Read bingo prompts"
on public.bingo_prompts
for select
using (
  is_active = true
  or exists (
    select 1
    from public.app_admins
    where app_admins.user_id = (select auth.uid())
  )
);

create policy "Admins can insert bingo prompts"
on public.bingo_prompts
for insert
with check (
  exists (
    select 1
    from public.app_admins
    where app_admins.user_id = (select auth.uid())
  )
);

create policy "Admins can update bingo prompts"
on public.bingo_prompts
for update
using (
  exists (
    select 1
    from public.app_admins
    where app_admins.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.app_admins
    where app_admins.user_id = (select auth.uid())
  )
);

create policy "Admins can delete bingo prompts"
on public.bingo_prompts
for delete
using (
  exists (
    select 1
    from public.app_admins
    where app_admins.user_id = (select auth.uid())
  )
);

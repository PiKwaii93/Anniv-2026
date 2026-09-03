-- Guests must never evaluate a subquery against the private admin registry.
-- Preserve the existing authenticated/admin predicates and all prompt data.
alter table public.bingo_prompts enable row level security;

alter policy "Read bingo prompts" on public.bingo_prompts to authenticated;
create policy "Guests can read active bingo prompts"
  on public.bingo_prompts for select to anon
  using (is_active = true);

alter policy "Admins can insert bingo prompts" on public.bingo_prompts to authenticated;
alter policy "Admins can update bingo prompts" on public.bingo_prompts to authenticated;
alter policy "Admins can delete bingo prompts" on public.bingo_prompts to authenticated;

-- Keep only the operations the guest and admin clients actually use.
revoke insert, update, delete, truncate, references, trigger
  on public.bingo_prompts from anon;
revoke truncate, references, trigger on public.bingo_prompts from authenticated;
grant select on public.bingo_prompts to anon;
grant select, insert, update, delete on public.bingo_prompts to authenticated;

-- No grants on app_admins, no SECURITY DEFINER, no disabled RLS.
notify pgrst, 'reload schema';

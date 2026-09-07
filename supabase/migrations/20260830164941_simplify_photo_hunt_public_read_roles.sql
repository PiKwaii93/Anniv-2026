drop policy if exists "Public read active Photo Hunt challenges" on public.photo_hunt_challenges;
drop policy if exists "Public read approved Photo Hunt submissions" on public.photo_hunt_submissions;

create policy "Public read active Photo Hunt challenges"
on public.photo_hunt_challenges
for select
to anon
using (is_active = true);

create policy "Public read approved Photo Hunt submissions"
on public.photo_hunt_submissions
for select
to anon
using (status = 'approved');

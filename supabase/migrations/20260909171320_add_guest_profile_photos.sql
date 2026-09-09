-- Profile photos are public party-facing assets because they must be visible
-- before a guest claims an identity. Only authenticated app administrators can
-- upload or remove files from the bucket.
alter table public.guests
  add column if not exists avatar_path text;

alter table public.plus_ones
  add column if not exists avatar_path text;

alter table public.guests
  drop constraint if exists guests_avatar_path_length;
alter table public.guests
  add constraint guests_avatar_path_length
  check (avatar_path is null or char_length(avatar_path) between 1 and 500);

alter table public.plus_ones
  drop constraint if exists plus_ones_avatar_path_length;
alter table public.plus_ones
  add constraint plus_ones_avatar_path_length
  check (avatar_path is null or char_length(avatar_path) between 1 and 500);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'guest-avatars',
  'guest-avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Guest avatar admin uploads" on storage.objects;
create policy "Guest avatar admin uploads"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'guest-avatars'
  and exists (
    select 1
    from public.app_admins
    where user_id = (select auth.uid())
  )
);

drop policy if exists "Guest avatar admin deletes" on storage.objects;
create policy "Guest avatar admin deletes"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'guest-avatars'
  and exists (
    select 1
    from public.app_admins
    where user_id = (select auth.uid())
  )
);

notify pgrst, 'reload schema';

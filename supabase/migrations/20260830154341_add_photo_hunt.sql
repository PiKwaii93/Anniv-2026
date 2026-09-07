alter table public.party_state
  add column if not exists photos_visible boolean not null default true;

alter table public.party_state
  drop constraint if exists party_state_featured_module_check;

alter table public.party_state
  add constraint party_state_featured_module_check
  check (
    featured_module is null
    or featured_module = any (
      array[
        'iceberg'::text,
        'beer-pong'::text,
        'bingo'::text,
        'missions'::text,
        'guests'::text,
        'room'::text,
        'photos'::text
      ]
    )
  );

create table if not exists public.photo_hunt_challenges (
  id uuid primary key default gen_random_uuid(),
  prompt text not null check (char_length(trim(prompt)) between 3 and 240),
  hint text check (hint is null or char_length(trim(hint)) <= 240),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (prompt)
);

create table if not exists public.photo_hunt_upload_slots (
  id uuid primary key default gen_random_uuid(),
  player_key text not null,
  player_name text not null,
  challenge_id uuid not null references public.photo_hunt_challenges(id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 4194304),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists photo_hunt_upload_slots_player_challenge_idx
  on public.photo_hunt_upload_slots(player_key, challenge_id, expires_at desc);

create table if not exists public.photo_hunt_submissions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.photo_hunt_challenges(id) on delete restrict,
  player_key text not null,
  player_name text not null,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  caption text check (caption is null or char_length(trim(caption)) <= 160),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  moderated_at timestamptz,
  moderated_by uuid references auth.users(id) on delete set null
);

create index if not exists photo_hunt_submissions_status_created_idx
  on public.photo_hunt_submissions(status, created_at desc);
create index if not exists photo_hunt_submissions_player_challenge_idx
  on public.photo_hunt_submissions(player_key, challenge_id, created_at desc);
create index if not exists photo_hunt_submissions_challenge_idx
  on public.photo_hunt_submissions(challenge_id);

alter table public.photo_hunt_challenges enable row level security;
alter table public.photo_hunt_upload_slots enable row level security;
alter table public.photo_hunt_submissions enable row level security;

drop policy if exists "Read Photo Hunt challenges" on public.photo_hunt_challenges;
create policy "Read Photo Hunt challenges"
on public.photo_hunt_challenges
for select
to anon, authenticated
using (
  is_active = true
  or exists (
    select 1 from public.app_admins
    where user_id = (select auth.uid())
  )
);

drop policy if exists "Admins insert Photo Hunt challenges" on public.photo_hunt_challenges;
create policy "Admins insert Photo Hunt challenges"
on public.photo_hunt_challenges
for insert
to authenticated
with check (
  exists (
    select 1 from public.app_admins
    where user_id = (select auth.uid())
  )
);

drop policy if exists "Admins update Photo Hunt challenges" on public.photo_hunt_challenges;
create policy "Admins update Photo Hunt challenges"
on public.photo_hunt_challenges
for update
to authenticated
using (
  exists (
    select 1 from public.app_admins
    where user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.app_admins
    where user_id = (select auth.uid())
  )
);

drop policy if exists "Admins delete Photo Hunt challenges" on public.photo_hunt_challenges;
create policy "Admins delete Photo Hunt challenges"
on public.photo_hunt_challenges
for delete
to authenticated
using (
  exists (
    select 1 from public.app_admins
    where user_id = (select auth.uid())
  )
);

drop policy if exists "Read approved Photo Hunt submissions" on public.photo_hunt_submissions;
create policy "Read approved Photo Hunt submissions"
on public.photo_hunt_submissions
for select
to anon, authenticated
using (
  status = 'approved'
  or exists (
    select 1 from public.app_admins
    where user_id = (select auth.uid())
  )
);

drop policy if exists "Admins update Photo Hunt submissions" on public.photo_hunt_submissions;
create policy "Admins update Photo Hunt submissions"
on public.photo_hunt_submissions
for update
to authenticated
using (
  exists (
    select 1 from public.app_admins
    where user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.app_admins
    where user_id = (select auth.uid())
  )
);

drop policy if exists "Admins delete Photo Hunt submissions" on public.photo_hunt_submissions;
create policy "Admins delete Photo Hunt submissions"
on public.photo_hunt_submissions
for delete
to authenticated
using (
  exists (
    select 1 from public.app_admins
    where user_id = (select auth.uid())
  )
);

grant select on public.photo_hunt_challenges to anon, authenticated;
grant insert, update, delete on public.photo_hunt_challenges to authenticated;
grant select on public.photo_hunt_submissions to anon, authenticated;
grant update, delete on public.photo_hunt_submissions to authenticated;
revoke all on public.photo_hunt_upload_slots from anon, authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'photo-hunt',
  'photo-hunt',
  false,
  4194304,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.photo_hunt_identity_name(
  p_player_key text,
  p_session_token uuid
)
returns text
language sql
security definer
set search_path = public
as $$
  select player_name
  from public.party_identity_sessions
  where player_key = p_player_key
    and session_token = p_session_token
  limit 1;
$$;

create or replace function public.can_upload_photo_hunt_object(p_name text)
returns boolean
language sql
security definer
set search_path = public, storage
as $$
  select exists (
    select 1
    from public.photo_hunt_upload_slots s
    where s.storage_path = p_name
      and s.used_at is null
      and s.expires_at > now()
  );
$$;

create or replace function public.can_read_photo_hunt_object(p_name text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.photo_hunt_submissions s
      where s.storage_path = p_name
        and s.status = 'approved'
    )
    or exists (
      select 1
      from public.app_admins a
      where a.user_id = auth.uid()
    );
$$;

revoke all on function public.photo_hunt_identity_name(text, uuid) from public;
revoke all on function public.can_upload_photo_hunt_object(text) from public;
revoke all on function public.can_read_photo_hunt_object(text) from public;
grant execute on function public.can_upload_photo_hunt_object(text) to anon, authenticated;
grant execute on function public.can_read_photo_hunt_object(text) to anon, authenticated;

drop policy if exists "Photo Hunt slot uploads" on storage.objects;
create policy "Photo Hunt slot uploads"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'photo-hunt'
  and public.can_upload_photo_hunt_object(name)
);

drop policy if exists "Photo Hunt approved downloads" on storage.objects;
create policy "Photo Hunt approved downloads"
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'photo-hunt'
  and public.can_read_photo_hunt_object(name)
);

drop policy if exists "Photo Hunt admin deletes" on storage.objects;
create policy "Photo Hunt admin deletes"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'photo-hunt'
  and exists (
    select 1 from public.app_admins
    where user_id = (select auth.uid())
  )
);

create or replace function public.create_photo_hunt_upload_slot(
  p_player_key text,
  p_session_token uuid,
  p_challenge_id uuid,
  p_mime_type text,
  p_size_bytes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_player_name text;
  v_slot public.photo_hunt_upload_slots%rowtype;
  v_slot_id uuid;
  v_extension text;
  v_path text;
begin
  if p_session_token is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SESSION');
  end if;

  if p_mime_type not in ('image/jpeg', 'image/png', 'image/webp')
     or p_size_bytes is null
     or p_size_bytes <= 0
     or p_size_bytes > 4194304 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_FILE');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('photo-hunt:' || p_player_key || ':' || p_challenge_id::text, 0)
  );

  v_player_name := public.photo_hunt_identity_name(p_player_key, p_session_token);
  if v_player_name is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SESSION');
  end if;

  if not exists (
    select 1 from public.photo_hunt_challenges
    where id = p_challenge_id and is_active = true
  ) then
    return jsonb_build_object('ok', false, 'code', 'CHALLENGE_NOT_AVAILABLE');
  end if;

  if exists (
    select 1 from public.photo_hunt_submissions
    where player_key = p_player_key
      and challenge_id = p_challenge_id
      and status in ('pending', 'approved')
  ) then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_SUBMITTED');
  end if;

  select * into v_slot
  from public.photo_hunt_upload_slots
  where player_key = p_player_key
    and challenge_id = p_challenge_id
    and used_at is null
    and expires_at > now()
  order by created_at desc
  limit 1
  for update;

  if found then
    return jsonb_build_object(
      'ok', true,
      'slotId', v_slot.id,
      'storagePath', v_slot.storage_path,
      'expiresAt', v_slot.expires_at
    );
  end if;

  v_slot_id := gen_random_uuid();
  v_extension := case p_mime_type
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
    else 'jpg'
  end;
  v_path := 'pending/' || v_slot_id::text || '.' || v_extension;

  insert into public.photo_hunt_upload_slots (
    id,
    player_key,
    player_name,
    challenge_id,
    storage_path,
    mime_type,
    size_bytes,
    expires_at
  ) values (
    v_slot_id,
    p_player_key,
    v_player_name,
    p_challenge_id,
    v_path,
    p_mime_type,
    p_size_bytes,
    now() + interval '15 minutes'
  );

  return jsonb_build_object(
    'ok', true,
    'slotId', v_slot_id,
    'storagePath', v_path,
    'expiresAt', now() + interval '15 minutes'
  );
end;
$$;

create or replace function public.finalize_photo_hunt_upload(
  p_slot_id uuid,
  p_player_key text,
  p_session_token uuid,
  p_caption text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_player_name text;
  v_slot public.photo_hunt_upload_slots%rowtype;
  v_submission_id uuid;
begin
  if p_caption is not null and char_length(trim(p_caption)) > 160 then
    return jsonb_build_object('ok', false, 'code', 'CAPTION_TOO_LONG');
  end if;

  v_player_name := public.photo_hunt_identity_name(p_player_key, p_session_token);
  if v_player_name is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SESSION');
  end if;

  select * into v_slot
  from public.photo_hunt_upload_slots
  where id = p_slot_id
  for update;

  if not found
     or v_slot.player_key <> p_player_key
     or v_slot.used_at is not null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SLOT');
  end if;

  if v_slot.expires_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'SLOT_EXPIRED');
  end if;

  if not exists (
    select 1
    from storage.objects
    where bucket_id = 'photo-hunt'
      and name = v_slot.storage_path
  ) then
    return jsonb_build_object('ok', false, 'code', 'UPLOAD_MISSING');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('photo-hunt:' || p_player_key || ':' || v_slot.challenge_id::text, 0)
  );

  if exists (
    select 1 from public.photo_hunt_submissions
    where player_key = p_player_key
      and challenge_id = v_slot.challenge_id
      and status in ('pending', 'approved')
  ) then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_SUBMITTED');
  end if;

  insert into public.photo_hunt_submissions (
    challenge_id,
    player_key,
    player_name,
    storage_path,
    mime_type,
    caption
  ) values (
    v_slot.challenge_id,
    p_player_key,
    v_player_name,
    v_slot.storage_path,
    v_slot.mime_type,
    nullif(trim(p_caption), '')
  )
  returning id into v_submission_id;

  update public.photo_hunt_upload_slots
  set used_at = now()
  where id = p_slot_id;

  return jsonb_build_object(
    'ok', true,
    'submissionId', v_submission_id,
    'status', 'pending'
  );
end;
$$;

create or replace function public.get_photo_hunt_player_state(
  p_player_key text,
  p_session_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_name text;
  v_submissions jsonb;
begin
  v_player_name := public.photo_hunt_identity_name(p_player_key, p_session_token);
  if v_player_name is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SESSION');
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  into v_submissions
  from (
    select distinct on (challenge_id)
      id,
      challenge_id as "challengeId",
      status,
      caption,
      created_at as "createdAt",
      moderated_at as "moderatedAt"
    from public.photo_hunt_submissions
    where player_key = p_player_key
    order by challenge_id, created_at desc
  ) x;

  update public.party_identity_sessions
  set last_seen_at = now(), updated_at = now()
  where player_key = p_player_key and session_token = p_session_token;

  return jsonb_build_object(
    'ok', true,
    'playerName', v_player_name,
    'submissions', v_submissions
  );
end;
$$;

revoke all on function public.create_photo_hunt_upload_slot(text, uuid, uuid, text, integer) from public;
revoke all on function public.finalize_photo_hunt_upload(uuid, text, uuid, text) from public;
revoke all on function public.get_photo_hunt_player_state(text, uuid) from public;
grant execute on function public.create_photo_hunt_upload_slot(text, uuid, uuid, text, integer) to anon, authenticated;
grant execute on function public.finalize_photo_hunt_upload(uuid, text, uuid, text) to anon, authenticated;
grant execute on function public.get_photo_hunt_player_state(text, uuid) to anon, authenticated;

insert into public.photo_hunt_challenges (prompt, hint, sort_order, is_active)
values
  ('Prends une photo avec quelqu’un que tu connais depuis plus de 10 ans.', 'À vous de prouver que le temps passe.', 10, true),
  ('Réunis 5 personnes portant du noir sur la même photo.', 'Plus dur qu’il n’y paraît.', 20, true),
  ('Fais une photo qui pourrait être la pochette d’un album.', 'Pose dramatique fortement recommandée.', 30, true),
  ('Prends une photo avec quelqu’un que tu viens de rencontrer ce soir.', 'Nouvelle rencontre débloquée.', 40, true),
  ('Capture un vrai fou rire.', 'Pas de sourire forcé.', 50, true),
  ('Fais un selfie avec 3 personnes que tu ne vois pas souvent.', null, 60, true),
  ('Trouve les chaussures les plus originales de la soirée.', 'Le propriétaire doit être dans le cadre.', 70, true),
  ('Recrée une photo de classe avec au moins 6 personnes.', 'Premier rang assis, deuxième rang debout ?', 80, true),
  ('Prends une photo avec deux personnes qui ont le même prénom ou presque.', 'Les variantes comptent si ça se défend.', 90, true),
  ('Fais une photo miroir avec au moins 3 personnes.', null, 100, true),
  ('Formez un cœur avec quatre mains.', 'Deux personnes minimum.', 110, true),
  ('Prends une photo de quelqu’un en plein milieu d’une danse.', 'Le mouvement doit se sentir.', 120, true),
  ('Fais une photo avec quelqu’un qui porte la même couleur que toi.', null, 130, true),
  ('Réunis sur une photo quelqu’un de très grand et quelqu’un de plus petit.', 'Jouez avec le contraste.', 140, true),
  ('Prends la photo la plus cinématographique possible de la soirée.', 'Lumière, cadrage, attitude : fais-toi plaisir.', 150, true),
  ('Fais une photo où tout le monde regarde dans une direction différente.', 'Chaos organisé.', 160, true),
  ('Capture un moment de concentration absolue.', 'Jeu, discussion, préparation…', 170, true),
  ('Prends une photo avec quelqu’un dont l’anniversaire tombe le même mois que le tien.', null, 180, true),
  ('Fais tenir au moins 7 personnes dans un selfie.', 'Pas de bras coupés si possible.', 190, true),
  ('Recrée une scène de film connue avec les moyens du bord.', 'Le titre pourra être deviné plus tard.', 200, true),
  ('Photographie le meilleur duo improvisé de la soirée.', 'À eux de vendre leur complicité.', 210, true),
  ('Fais une photo où personne ne regarde l’objectif.', 'Comme si le photographe n’existait pas.', 220, true),
  ('Prends une photo de groupe avec une pose parfaitement synchronisée.', 'Même geste, même énergie.', 230, true),
  ('Capture le détail le plus “Anniv 2026” de la soirée.', 'Décor, objet, scène ou détail qui résume l’ambiance.', 240, true)
on conflict (prompt) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'photo_hunt_submissions'
  ) then
    alter publication supabase_realtime add table public.photo_hunt_submissions;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'photo_hunt_challenges'
  ) then
    alter publication supabase_realtime add table public.photo_hunt_challenges;
  end if;
end $$;

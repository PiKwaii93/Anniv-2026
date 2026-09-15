alter table public.photo_hunt_submissions
  add column if not exists image_width integer,
  add column if not exists image_height integer;

alter table public.photo_hunt_submissions
  drop constraint if exists photo_hunt_submissions_image_dimensions_check;

alter table public.photo_hunt_submissions
  add constraint photo_hunt_submissions_image_dimensions_check
  check (
    (image_width is null and image_height is null)
    or (
      image_width between 1 and 10000
      and image_height between 1 and 10000
    )
  );

create or replace function public.finalize_photo_hunt_upload(
  p_slot_id uuid,
  p_player_key text,
  p_session_token uuid,
  p_image_width integer,
  p_image_height integer,
  p_caption text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_name text;
  v_slot public.photo_hunt_upload_slots%rowtype;
  v_submission_id uuid;
begin
  if p_caption is not null and char_length(btrim(p_caption)) > 160 then
    return jsonb_build_object('ok', false, 'code', 'CAPTION_TOO_LONG');
  end if;

  if p_image_width is null
     or p_image_height is null
     or p_image_width not between 1 and 10000
     or p_image_height not between 1 and 10000 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_FILE');
  end if;

  v_player_name := public.photo_hunt_identity_name(p_player_key, p_session_token);
  if v_player_name is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SESSION');
  end if;

  select *
  into v_slot
  from public.photo_hunt_upload_slots s
  where s.id = p_slot_id
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
    from storage.objects o
    where o.bucket_id = 'photo-hunt'
      and o.name = v_slot.storage_path
  ) then
    return jsonb_build_object('ok', false, 'code', 'UPLOAD_MISSING');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'photo-hunt:' || p_player_key || ':' || v_slot.challenge_id::text,
      0
    )
  );

  if exists (
    select 1
    from public.photo_hunt_submissions s
    where s.player_key = p_player_key
      and s.challenge_id = v_slot.challenge_id
      and s.status in ('pending', 'approved')
  ) then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_SUBMITTED');
  end if;

  insert into public.photo_hunt_submissions (
    challenge_id,
    player_key,
    player_name,
    storage_path,
    mime_type,
    image_width,
    image_height,
    caption
  ) values (
    v_slot.challenge_id,
    p_player_key,
    v_player_name,
    v_slot.storage_path,
    v_slot.mime_type,
    p_image_width,
    p_image_height,
    nullif(btrim(p_caption), '')
  )
  returning id into v_submission_id;

  update public.photo_hunt_upload_slots
  set used_at = now()
  where id = p_slot_id;

  return jsonb_build_object(
    'ok', true,
    'submissionId', v_submission_id,
    'status', 'approved'
  );
end;
$$;

revoke all on function public.finalize_photo_hunt_upload(uuid, text, uuid, integer, integer, text)
  from public;
grant execute on function public.finalize_photo_hunt_upload(uuid, text, uuid, integer, integer, text)
  to anon, authenticated;

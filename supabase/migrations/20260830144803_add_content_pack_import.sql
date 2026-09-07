create or replace function public.admin_import_content_pack(
  p_pack jsonb,
  p_mode text default 'merge',
  p_modules text[] default array['bingo','missions','room','iceberg']::text[]
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_item jsonb;
  v_incoming_id uuid;
  v_existing_id uuid;
  v_keep_ids uuid[];
  v_disabled integer;

  v_bingo_inserted integer := 0;
  v_bingo_updated integer := 0;
  v_bingo_matched integer := 0;
  v_bingo_disabled integer := 0;

  v_missions_inserted integer := 0;
  v_missions_updated integer := 0;
  v_missions_matched integer := 0;
  v_missions_disabled integer := 0;

  v_room_inserted integer := 0;
  v_room_updated integer := 0;
  v_room_matched integer := 0;
  v_room_disabled integer := 0;

  v_iceberg_inserted integer := 0;
  v_iceberg_updated integer := 0;
  v_iceberg_matched integer := 0;
  v_iceberg_disabled integer := 0;
begin
  if not exists (
    select 1
    from public.app_admins
    where user_id = (select auth.uid())
  ) then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN');
  end if;

  if jsonb_typeof(p_pack) <> 'object'
     or p_pack->>'schema' <> 'anniv-2026-content-pack'
     or coalesce((p_pack->>'version')::integer, 0) <> 1
     or jsonb_typeof(p_pack->'modules') <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_PACK');
  end if;

  if p_mode not in ('merge', 'restore') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_MODE');
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_modules, array[]::text[])) module_name
    where module_name not in ('bingo','missions','room','iceberg')
  ) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_MODULE');
  end if;

  begin
    if 'bingo' = any(p_modules) then
      if jsonb_typeof(p_pack->'modules'->'bingo') <> 'array' then
        raise exception 'Bingo doit être un tableau';
      end if;

      v_keep_ids := array[]::uuid[];
      for v_item in select value from jsonb_array_elements(p_pack->'modules'->'bingo')
      loop
        if coalesce(v_item->>'text', '') = '' then
          raise exception 'Une case Bingo est vide';
        end if;

        if nullif(v_item->>'id', '') is null then
          v_incoming_id := gen_random_uuid();
        else
          v_incoming_id := (v_item->>'id')::uuid;
        end if;

        select id into v_existing_id
        from public.bingo_prompts
        where id = v_incoming_id;

        if found then
          update public.bingo_prompts
          set text = trim(v_item->>'text'),
              sort_order = coalesce((v_item->>'sortOrder')::integer, 0),
              is_active = coalesce((v_item->>'isActive')::boolean, true),
              updated_at = now()
          where id = v_existing_id;
          v_bingo_updated := v_bingo_updated + 1;
        else
          select id into v_existing_id
          from public.bingo_prompts
          where lower(trim(text)) = lower(trim(v_item->>'text'))
          order by created_at
          limit 1;

          if found then
            update public.bingo_prompts
            set text = trim(v_item->>'text'),
                sort_order = coalesce((v_item->>'sortOrder')::integer, 0),
                is_active = coalesce((v_item->>'isActive')::boolean, true),
                updated_at = now()
            where id = v_existing_id;
            v_bingo_matched := v_bingo_matched + 1;
          else
            v_existing_id := v_incoming_id;
            insert into public.bingo_prompts (id, text, sort_order, is_active)
            values (
              v_existing_id,
              trim(v_item->>'text'),
              coalesce((v_item->>'sortOrder')::integer, 0),
              coalesce((v_item->>'isActive')::boolean, true)
            );
            v_bingo_inserted := v_bingo_inserted + 1;
          end if;
        end if;

        v_keep_ids := array_append(v_keep_ids, v_existing_id);
      end loop;

      if p_mode = 'restore' then
        update public.bingo_prompts
        set is_active = false,
            updated_at = now()
        where not (id = any(v_keep_ids))
          and is_active = true;
        get diagnostics v_disabled = row_count;
        v_bingo_disabled := v_disabled;
      end if;
    end if;

    if 'missions' = any(p_modules) then
      if jsonb_typeof(p_pack->'modules'->'missions') <> 'array' then
        raise exception 'Missions doit être un tableau';
      end if;

      v_keep_ids := array[]::uuid[];
      for v_item in select value from jsonb_array_elements(p_pack->'modules'->'missions')
      loop
        if coalesce(v_item->>'text', '') = '' then
          raise exception 'Une mission est vide';
        end if;

        if nullif(v_item->>'id', '') is null then
          v_incoming_id := gen_random_uuid();
        else
          v_incoming_id := (v_item->>'id')::uuid;
        end if;

        select id into v_existing_id
        from public.secret_mission_prompts
        where id = v_incoming_id;

        if found then
          update public.secret_mission_prompts
          set text = trim(v_item->>'text'),
              difficulty = coalesce(nullif(v_item->>'difficulty', ''), 'medium'),
              sort_order = coalesce((v_item->>'sortOrder')::integer, 0),
              is_active = coalesce((v_item->>'isActive')::boolean, true),
              updated_at = now()
          where id = v_existing_id;
          v_missions_updated := v_missions_updated + 1;
        else
          select id into v_existing_id
          from public.secret_mission_prompts
          where lower(trim(text)) = lower(trim(v_item->>'text'))
          order by created_at
          limit 1;

          if found then
            update public.secret_mission_prompts
            set text = trim(v_item->>'text'),
                difficulty = coalesce(nullif(v_item->>'difficulty', ''), 'medium'),
                sort_order = coalesce((v_item->>'sortOrder')::integer, 0),
                is_active = coalesce((v_item->>'isActive')::boolean, true),
                updated_at = now()
            where id = v_existing_id;
            v_missions_matched := v_missions_matched + 1;
          else
            v_existing_id := v_incoming_id;
            insert into public.secret_mission_prompts (id, text, difficulty, sort_order, is_active)
            values (
              v_existing_id,
              trim(v_item->>'text'),
              coalesce(nullif(v_item->>'difficulty', ''), 'medium'),
              coalesce((v_item->>'sortOrder')::integer, 0),
              coalesce((v_item->>'isActive')::boolean, true)
            );
            v_missions_inserted := v_missions_inserted + 1;
          end if;
        end if;

        v_keep_ids := array_append(v_keep_ids, v_existing_id);
      end loop;

      if p_mode = 'restore' then
        update public.secret_mission_prompts
        set is_active = false,
            updated_at = now()
        where not (id = any(v_keep_ids))
          and is_active = true;
        get diagnostics v_disabled = row_count;
        v_missions_disabled := v_disabled;
      end if;
    end if;

    if 'room' = any(p_modules) then
      if jsonb_typeof(p_pack->'modules'->'room') <> 'array' then
        raise exception 'La Salle doit être un tableau';
      end if;

      v_keep_ids := array[]::uuid[];
      for v_item in select value from jsonb_array_elements(p_pack->'modules'->'room')
      loop
        if coalesce(v_item->>'prompt', '') = '' then
          raise exception 'Une question La Salle est vide';
        end if;

        if nullif(v_item->>'id', '') is null then
          v_incoming_id := gen_random_uuid();
        else
          v_incoming_id := (v_item->>'id')::uuid;
        end if;

        select id into v_existing_id
        from public.live_vote_questions
        where id = v_incoming_id;

        if found then
          update public.live_vote_questions
          set mode = v_item->>'mode',
              prompt = trim(v_item->>'prompt'),
              options = coalesce(v_item->'options', '[]'::jsonb),
              correct_player_key = nullif(v_item->>'correctPlayerKey', ''),
              suspects = coalesce(v_item->'suspects', '[]'::jsonb),
              reveal_note = coalesce(v_item->>'revealNote', ''),
              timer_seconds = nullif(v_item->>'timerSeconds', '')::smallint,
              sort_order = coalesce((v_item->>'sortOrder')::integer, 0),
              is_active = coalesce((v_item->>'isActive')::boolean, true),
              updated_at = now()
          where id = v_existing_id;
          v_room_updated := v_room_updated + 1;
        else
          select id into v_existing_id
          from public.live_vote_questions
          where mode = v_item->>'mode'
            and lower(trim(prompt)) = lower(trim(v_item->>'prompt'))
          order by created_at
          limit 1;

          if found then
            update public.live_vote_questions
            set prompt = trim(v_item->>'prompt'),
                options = coalesce(v_item->'options', '[]'::jsonb),
                correct_player_key = nullif(v_item->>'correctPlayerKey', ''),
                suspects = coalesce(v_item->'suspects', '[]'::jsonb),
                reveal_note = coalesce(v_item->>'revealNote', ''),
                timer_seconds = nullif(v_item->>'timerSeconds', '')::smallint,
                sort_order = coalesce((v_item->>'sortOrder')::integer, 0),
                is_active = coalesce((v_item->>'isActive')::boolean, true),
                updated_at = now()
            where id = v_existing_id;
            v_room_matched := v_room_matched + 1;
          else
            v_existing_id := v_incoming_id;
            insert into public.live_vote_questions (
              id, mode, prompt, options, correct_player_key, suspects,
              reveal_note, timer_seconds, sort_order, is_active
            ) values (
              v_existing_id,
              v_item->>'mode',
              trim(v_item->>'prompt'),
              coalesce(v_item->'options', '[]'::jsonb),
              nullif(v_item->>'correctPlayerKey', ''),
              coalesce(v_item->'suspects', '[]'::jsonb),
              coalesce(v_item->>'revealNote', ''),
              nullif(v_item->>'timerSeconds', '')::smallint,
              coalesce((v_item->>'sortOrder')::integer, 0),
              coalesce((v_item->>'isActive')::boolean, true)
            );
            v_room_inserted := v_room_inserted + 1;
          end if;
        end if;

        v_keep_ids := array_append(v_keep_ids, v_existing_id);
      end loop;

      if p_mode = 'restore' then
        update public.live_vote_questions
        set is_active = false,
            updated_at = now()
        where not (id = any(v_keep_ids))
          and is_active = true;
        get diagnostics v_disabled = row_count;
        v_room_disabled := v_disabled;
      end if;
    end if;

    if 'iceberg' = any(p_modules) then
      if jsonb_typeof(p_pack->'modules'->'iceberg') <> 'array' then
        raise exception 'Iceberg doit être un tableau';
      end if;

      v_keep_ids := array[]::uuid[];
      for v_item in select value from jsonb_array_elements(p_pack->'modules'->'iceberg')
      loop
        if coalesce(v_item->>'title', '') = '' then
          raise exception 'Un dossier Iceberg est sans titre';
        end if;

        if nullif(v_item->>'id', '') is null then
          v_incoming_id := gen_random_uuid();
        else
          v_incoming_id := (v_item->>'id')::uuid;
        end if;

        select id into v_existing_id
        from public.iceberg_entries
        where id = v_incoming_id;

        if found then
          update public.iceberg_entries
          set level = (v_item->>'level')::smallint,
              title = trim(v_item->>'title'),
              description = coalesce(v_item->>'description', ''),
              sort_order = coalesce((v_item->>'sortOrder')::integer, 0),
              is_published = coalesce((v_item->>'isPublished')::boolean, true),
              updated_at = now()
          where id = v_existing_id;
          v_iceberg_updated := v_iceberg_updated + 1;
        else
          select id into v_existing_id
          from public.iceberg_entries
          where level = (v_item->>'level')::smallint
            and lower(trim(title)) = lower(trim(v_item->>'title'))
          order by created_at
          limit 1;

          if found then
            update public.iceberg_entries
            set title = trim(v_item->>'title'),
                description = coalesce(v_item->>'description', ''),
                sort_order = coalesce((v_item->>'sortOrder')::integer, 0),
                is_published = coalesce((v_item->>'isPublished')::boolean, true),
                updated_at = now()
            where id = v_existing_id;
            v_iceberg_matched := v_iceberg_matched + 1;
          else
            v_existing_id := v_incoming_id;
            insert into public.iceberg_entries (id, level, title, description, sort_order, is_published)
            values (
              v_existing_id,
              (v_item->>'level')::smallint,
              trim(v_item->>'title'),
              coalesce(v_item->>'description', ''),
              coalesce((v_item->>'sortOrder')::integer, 0),
              coalesce((v_item->>'isPublished')::boolean, true)
            );
            v_iceberg_inserted := v_iceberg_inserted + 1;
          end if;
        end if;

        v_keep_ids := array_append(v_keep_ids, v_existing_id);
      end loop;

      if p_mode = 'restore' then
        update public.iceberg_entries
        set is_published = false,
            updated_at = now()
        where not (id = any(v_keep_ids))
          and is_published = true;
        get diagnostics v_disabled = row_count;
        v_iceberg_disabled := v_disabled;
      end if;
    end if;
  exception when others then
    return jsonb_build_object(
      'ok', false,
      'code', 'INVALID_PACK',
      'message', sqlerrm
    );
  end;

  return jsonb_build_object(
    'ok', true,
    'mode', p_mode,
    'summary', jsonb_build_object(
      'bingo', jsonb_build_object(
        'inserted', v_bingo_inserted,
        'updated', v_bingo_updated,
        'matched', v_bingo_matched,
        'disabled', v_bingo_disabled
      ),
      'missions', jsonb_build_object(
        'inserted', v_missions_inserted,
        'updated', v_missions_updated,
        'matched', v_missions_matched,
        'disabled', v_missions_disabled
      ),
      'room', jsonb_build_object(
        'inserted', v_room_inserted,
        'updated', v_room_updated,
        'matched', v_room_matched,
        'disabled', v_room_disabled
      ),
      'iceberg', jsonb_build_object(
        'inserted', v_iceberg_inserted,
        'updated', v_iceberg_updated,
        'matched', v_iceberg_matched,
        'disabled', v_iceberg_disabled
      )
    )
  );
end;
$function$;

revoke all on function public.admin_import_content_pack(jsonb, text, text[]) from public;
grant execute on function public.admin_import_content_pack(jsonb, text, text[]) to authenticated;

alter function public.admin_import_content_pack(jsonb, text, text[])
  rename to admin_import_content_pack_v1_core;

create or replace function public.admin_import_content_pack(
  p_pack jsonb,
  p_mode text default 'merge'::text,
  p_modules text[] default array['bingo','missions','room','iceberg','photos']::text[]
)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_version integer;
  v_base_modules text[];
  v_base_result jsonb;
  v_item jsonb;
  v_incoming_id uuid;
  v_existing_id uuid;
  v_keep_ids uuid[];
  v_disabled integer := 0;
  v_photos_inserted integer := 0;
  v_photos_updated integer := 0;
  v_photos_matched integer := 0;
  v_photos_disabled integer := 0;
  v_summary jsonb := jsonb_build_object(
    'bingo', jsonb_build_object('inserted',0,'updated',0,'matched',0,'disabled',0),
    'missions', jsonb_build_object('inserted',0,'updated',0,'matched',0,'disabled',0),
    'room', jsonb_build_object('inserted',0,'updated',0,'matched',0,'disabled',0),
    'iceberg', jsonb_build_object('inserted',0,'updated',0,'matched',0,'disabled',0),
    'photos', jsonb_build_object('inserted',0,'updated',0,'matched',0,'disabled',0)
  );
begin
  if not exists (
    select 1 from public.app_admins where user_id = (select auth.uid())
  ) then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN');
  end if;

  begin
    v_version := coalesce((p_pack->>'version')::integer, 0);
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'INVALID_PACK');
  end;

  if jsonb_typeof(p_pack) <> 'object'
     or p_pack->>'schema' <> 'anniv-2026-content-pack'
     or v_version not in (1, 2)
     or jsonb_typeof(p_pack->'modules') <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_PACK');
  end if;

  if p_mode not in ('merge', 'restore') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_MODE');
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_modules, array[]::text[])) module_name
    where module_name not in ('bingo','missions','room','iceberg','photos')
  ) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_MODULE');
  end if;

  begin
    select coalesce(array_agg(module_name), array[]::text[])
    into v_base_modules
    from unnest(coalesce(p_modules, array[]::text[])) module_name
    where module_name in ('bingo','missions','room','iceberg');

    if cardinality(v_base_modules) > 0 then
      v_base_result := public.admin_import_content_pack_v1_core(
        jsonb_set(p_pack, '{version}', '1'::jsonb, true),
        p_mode,
        v_base_modules
      );

      if coalesce((v_base_result->>'ok')::boolean, false) is not true then
        raise exception 'Import historique refusé: %', coalesce(v_base_result->>'message', v_base_result->>'code', 'INVALID_PACK');
      end if;

      v_summary := v_summary || coalesce(v_base_result->'summary', '{}'::jsonb);
    end if;

    if 'photos' = any(coalesce(p_modules, array[]::text[])) then
      if jsonb_typeof(p_pack->'modules'->'photos') <> 'array' then
        raise exception 'Photo Hunt doit être un tableau';
      end if;

      v_keep_ids := array[]::uuid[];

      for v_item in
        select value from jsonb_array_elements(p_pack->'modules'->'photos')
      loop
        if char_length(trim(coalesce(v_item->>'prompt', ''))) < 3
           or char_length(trim(coalesce(v_item->>'prompt', ''))) > 240 then
          raise exception 'Un défi Photo Hunt doit contenir entre 3 et 240 caractères';
        end if;

        if char_length(trim(coalesce(v_item->>'hint', ''))) > 240 then
          raise exception 'Un indice Photo Hunt dépasse 240 caractères';
        end if;

        if nullif(v_item->>'id', '') is null then
          v_incoming_id := gen_random_uuid();
        else
          v_incoming_id := (v_item->>'id')::uuid;
        end if;

        select id into v_existing_id
        from public.photo_hunt_challenges
        where id = v_incoming_id;

        if found then
          update public.photo_hunt_challenges
          set prompt = trim(v_item->>'prompt'),
              hint = nullif(trim(coalesce(v_item->>'hint', '')), ''),
              sort_order = coalesce((v_item->>'sortOrder')::integer, 0),
              is_active = coalesce((v_item->>'isActive')::boolean, true),
              updated_at = now()
          where id = v_existing_id;
          v_photos_updated := v_photos_updated + 1;
        else
          select id into v_existing_id
          from public.photo_hunt_challenges
          where lower(trim(prompt)) = lower(trim(v_item->>'prompt'))
          order by created_at
          limit 1;

          if found then
            update public.photo_hunt_challenges
            set prompt = trim(v_item->>'prompt'),
                hint = nullif(trim(coalesce(v_item->>'hint', '')), ''),
                sort_order = coalesce((v_item->>'sortOrder')::integer, 0),
                is_active = coalesce((v_item->>'isActive')::boolean, true),
                updated_at = now()
            where id = v_existing_id;
            v_photos_matched := v_photos_matched + 1;
          else
            v_existing_id := v_incoming_id;
            insert into public.photo_hunt_challenges (
              id, prompt, hint, sort_order, is_active
            ) values (
              v_existing_id,
              trim(v_item->>'prompt'),
              nullif(trim(coalesce(v_item->>'hint', '')), ''),
              coalesce((v_item->>'sortOrder')::integer, 0),
              coalesce((v_item->>'isActive')::boolean, true)
            );
            v_photos_inserted := v_photos_inserted + 1;
          end if;
        end if;

        v_keep_ids := array_append(v_keep_ids, v_existing_id);
      end loop;

      if p_mode = 'restore' then
        update public.photo_hunt_challenges
        set is_active = false,
            updated_at = now()
        where not (id = any(v_keep_ids))
          and is_active = true;
        get diagnostics v_disabled = row_count;
        v_photos_disabled := v_disabled;
      end if;

      v_summary := jsonb_set(
        v_summary,
        '{photos}',
        jsonb_build_object(
          'inserted', v_photos_inserted,
          'updated', v_photos_updated,
          'matched', v_photos_matched,
          'disabled', v_photos_disabled
        ),
        true
      );
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
    'summary', v_summary
  );
end;
$function$;

revoke all on function public.admin_import_content_pack(jsonb, text, text[]) from public;
revoke execute on function public.admin_import_content_pack(jsonb, text, text[]) from anon;
grant execute on function public.admin_import_content_pack(jsonb, text, text[]) to authenticated, service_role;

create or replace function public.private_assign_secret_mission(p_player_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prompt_id uuid;
  v_completed integer := 0;
  v_roll double precision;
  v_target_difficulty text;
begin
  select completed_count
  into v_completed
  from public.secret_mission_players
  where id = p_player_id;

  v_roll := random();

  if v_completed = 0 then
    v_target_difficulty := case
      when v_roll < 0.65 then 'easy'
      else 'medium'
    end;
  elsif v_completed < 3 then
    v_target_difficulty := case
      when v_roll < 0.35 then 'easy'
      when v_roll < 0.85 then 'medium'
      else 'hard'
    end;
  else
    v_target_difficulty := case
      when v_roll < 0.20 then 'easy'
      when v_roll < 0.65 then 'medium'
      else 'hard'
    end;
  end if;

  select p.id
  into v_prompt_id
  from public.secret_mission_prompts p
  where p.is_active = true
    and p.difficulty = v_target_difficulty
    and not exists (
      select 1
      from public.secret_mission_history h
      where h.player_id = p_player_id
        and h.prompt_id = p.id
    )
  order by random()
  limit 1;

  if v_prompt_id is null then
    select p.id
    into v_prompt_id
    from public.secret_mission_prompts p
    where p.is_active = true
      and not exists (
        select 1
        from public.secret_mission_history h
        where h.player_id = p_player_id
          and h.prompt_id = p.id
      )
    order by random()
    limit 1;
  end if;

  if v_prompt_id is null then
    select p.id
    into v_prompt_id
    from public.secret_mission_prompts p
    where p.is_active = true
    order by random()
    limit 1;
  end if;

  update public.secret_mission_players
  set current_prompt_id = v_prompt_id,
      assigned_at = case when v_prompt_id is null then null else now() end,
      updated_at = now()
  where id = p_player_id;

  return v_prompt_id;
end;
$$;

revoke all on function public.private_assign_secret_mission(uuid) from public, anon, authenticated;

create or replace function public.admin_apply_party_scene(p_scene text)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_phase text;
  v_featured text;
  v_message text;
  v_kind text := 'info';
  v_duration integer;
  v_clear_announcement boolean := false;
  v_now timestamptz := now();
begin
  if not exists (
    select 1
    from public.app_admins
    where user_id = (select auth.uid())
  ) then
    return jsonb_build_object('ok', false, 'code', 'NOT_ADMIN');
  end if;

  case p_scene
    when 'welcome' then
      v_phase := 'preparation';
      v_featured := null;
      v_clear_announcement := true;
    when 'room' then
      v_phase := 'live';
      v_featured := 'room';
      v_message := '📊 Tout le monde dans La Salle !';
      v_kind := 'game';
      v_duration := 20;
    when 'beer-pong' then
      v_phase := 'live';
      v_featured := 'beer-pong';
      v_message := '🍺 Beer Pong : rendez-vous à la table !';
      v_kind := 'game';
      v_duration := 20;
    when 'photo-time' then
      v_phase := 'live';
      v_featured := 'photos';
      v_message := '📸 Photo time ! Sortez les téléphones.';
      v_kind := 'photo';
      v_duration := 30;
    when 'cake' then
      v_phase := 'live';
      v_featured := null;
      v_message := '🎂 Gâteau ! On se rassemble.';
      v_kind := 'food';
      v_duration := 60;
    when 'closing' then
      v_phase := 'ended';
      v_featured := null;
      v_message := '🏆 Merci à tous ! Le Hall of Fame est ouvert.';
      v_kind := 'info';
      v_duration := 30;
    else
      return jsonb_build_object('ok', false, 'code', 'INVALID_SCENE');
  end case;

  perform 1 from public.party_state where id = 'main' for update;
  perform 1 from public.party_announcements where id = 'main' for update;

  update public.party_state
  set phase = v_phase,
      featured_module = v_featured,
      room_visible = case when p_scene = 'room' then true else room_visible end,
      beer_pong_visible = case when p_scene = 'beer-pong' then true else beer_pong_visible end,
      photos_visible = case when p_scene = 'photo-time' then true else photos_visible end,
      guests_visible = case when p_scene = 'welcome' then true else guests_visible end,
      updated_at = v_now
  where id = 'main';

  if v_clear_announcement then
    update public.party_announcements
    set is_active = false,
        expires_at = null,
        event_id = gen_random_uuid(),
        updated_at = v_now
    where id = 'main';
  elsif v_message is not null then
    update public.party_announcements
    set message = v_message,
        kind = v_kind,
        is_active = true,
        expires_at = v_now + make_interval(secs => v_duration),
        event_id = gen_random_uuid(),
        updated_at = v_now
    where id = 'main';
  end if;

  return jsonb_build_object(
    'ok', true,
    'scene', p_scene,
    'phase', v_phase,
    'featuredModule', v_featured,
    'announcement', case
      when v_clear_announcement then null
      when v_message is not null then jsonb_build_object(
        'message', v_message,
        'kind', v_kind,
        'durationSeconds', v_duration
      )
      else null
    end
  );
exception when others then
  return jsonb_build_object(
    'ok', false,
    'code', 'SCENE_FAILED',
    'message', sqlerrm
  );
end;
$$;

revoke all on function public.admin_apply_party_scene(text) from public;
revoke execute on function public.admin_apply_party_scene(text) from anon;
grant execute on function public.admin_apply_party_scene(text) to authenticated;

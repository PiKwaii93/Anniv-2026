create table public.announcement_push_events (
  event_key text primary key,
  announcement_event_id uuid not null unique,
  claimed_at timestamptz,
  completed_at timestamptz,
  sent_count integer not null default 0 check (sent_count >= 0),
  expired_count integer not null default 0 check (expired_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  created_at timestamptz not null default now(),
  check (event_key = 'announcement:' || announcement_event_id::text)
);

alter table public.announcement_push_events enable row level security;
revoke all on table public.announcement_push_events from public, anon, authenticated;

create or replace function public.publish_party_announcement_with_push(
  p_message text,
  p_kind text,
  p_duration_seconds integer,
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message text := btrim(coalesce(p_message, ''));
  v_now timestamptz := now();
  v_event_key text;
  v_announcement public.party_announcements%rowtype;
begin
  if v_message = '' or char_length(v_message) > 240 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_MESSAGE');
  end if;

  if p_kind not in ('info', 'food', 'photo', 'game', 'urgent') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_KIND');
  end if;

  if p_duration_seconds is not null
    and (p_duration_seconds < 5 or p_duration_seconds > 3600) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_DURATION');
  end if;

  if p_event_id is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_EVENT');
  end if;

  v_event_key := 'announcement:' || p_event_id::text;

  update public.party_announcements
  set message = v_message,
      kind = p_kind,
      is_active = true,
      expires_at = case
        when p_duration_seconds is null then null
        else v_now + make_interval(secs => p_duration_seconds)
      end,
      event_id = p_event_id,
      updated_at = v_now
  where id = 'main'
  returning * into v_announcement;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'ANNOUNCEMENT_NOT_FOUND');
  end if;

  insert into public.announcement_push_events (
    event_key,
    announcement_event_id
  ) values (
    v_event_key,
    p_event_id
  )
  on conflict (event_key) do nothing;

  return jsonb_build_object(
    'ok', true,
    'eventKey', v_event_key,
    'announcement', to_jsonb(v_announcement)
  );
end;
$$;

revoke all on function public.publish_party_announcement_with_push(text, text, integer, uuid)
from public, anon, authenticated;
grant execute on function public.publish_party_announcement_with_push(text, text, integer, uuid)
to service_role;

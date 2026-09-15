-- Resolve chat avatars from the validated identity key so namesakes never
-- receive each other's photo and existing messages benefit from later edits.
create or replace function party_chat.state(
  p_player_key text,
  p_session_token uuid,
  p_admin boolean,
  p_summary boolean,
  p_before bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_last bigint := 0;
  v_latest bigint;
  v_oldest bigint;
  v_unread integer := 0;
  v_messages jsonb := '[]';
  v_open boolean;
begin
  if coalesce(p_admin, false) then
    if not exists(
      select 1
      from public.app_admins
      where user_id = (select auth.uid())
    ) then
      raise exception 'NOT_ADMIN';
    end if;
  else
    perform party_extras.identity_name(p_player_key, p_session_token);

    select coalesce(last_id, 0)
    into v_last
    from party_chat.reads
    where player_key = p_player_key;

    select count(*)
    into v_unread
    from party_chat.messages
    where id > coalesce(v_last, 0)
      and not deleted
      and player_key <> p_player_key;
  end if;

  select coalesce(max(id), 0)
  into v_latest
  from party_chat.messages;

  select open
  into v_open
  from party_chat.settings
  where id;

  if not coalesce(p_summary, false) then
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', message.id::text,
            'name', message.player_name,
            'body', message.body,
            'created_at', message.created_at,
            'mine', coalesce(message.player_key = p_player_key, false),
            'avatarPath', message.avatar_path
          )
          order by message.id
        ),
        '[]'
      ),
      min(message.id)
    into v_messages, v_oldest
    from (
      select
        stored_message.*,
        coalesce(guest.avatar_path, plus_one.avatar_path) as avatar_path
      from party_chat.messages as stored_message
      left join public.guests as guest
        on stored_message.player_key = 'guest:' || guest.id::text
      left join public.plus_ones as plus_one
        on stored_message.player_key = 'plus:' || plus_one.id::text
      where not stored_message.deleted
        and (p_before is null or stored_message.id < p_before)
      order by stored_message.id desc
      limit 50
    ) as message;
  end if;

  return jsonb_build_object(
    'messages', v_messages,
    'unread', v_unread,
    'latest', v_latest::text,
    'open', v_open,
    'oldest', v_oldest::text,
    'more', exists(
      select 1
      from party_chat.messages
      where not deleted
        and id < v_oldest
    )
  );
end;
$$;

revoke all on function party_chat.state(text, uuid, boolean, boolean, bigint)
from public;

grant execute on function party_chat.state(text, uuid, boolean, boolean, bigint)
to anon, authenticated;

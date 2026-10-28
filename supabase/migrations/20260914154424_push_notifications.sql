create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  player_key text not null
    references public.party_identity_sessions(player_key)
    on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint push_subscriptions_player_key_format
    check (player_key like 'guest:%' or player_key like 'plus:%'),
  constraint push_subscriptions_endpoint_format
    check (char_length(endpoint) between 20 and 4096 and endpoint like 'https://%'),
  constraint push_subscriptions_p256dh_format
    check (char_length(p256dh) between 40 and 200),
  constraint push_subscriptions_auth_format
    check (char_length(auth) between 16 and 200)
);

create index push_subscriptions_player_key_idx
on public.push_subscriptions(player_key);

alter table public.push_subscriptions enable row level security;

revoke all on table public.push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on table public.push_subscriptions to service_role;

create or replace function public.register_push_subscription(
  p_player_key text,
  p_session_token uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if party_identity.is_valid(p_player_key, p_session_token) is distinct from true then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SESSION');
  end if;

  if p_endpoint is null
    or char_length(p_endpoint) not between 20 and 4096
    or p_endpoint not like 'https://%'
    or p_p256dh is null
    or char_length(p_p256dh) not between 40 and 200
    or p_auth is null
    or char_length(p_auth) not between 16 and 200
  then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SUBSCRIPTION');
  end if;

  -- One global guest session currently represents one device. Remove stale
  -- endpoints for that identity before refreshing the current subscription.
  delete from public.push_subscriptions
  where player_key = p_player_key
    and endpoint <> p_endpoint;

  insert into public.push_subscriptions (
    player_key,
    endpoint,
    p256dh,
    auth
  ) values (
    p_player_key,
    p_endpoint,
    p_p256dh,
    p_auth
  )
  on conflict (endpoint) do update
  set player_key = excluded.player_key,
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      updated_at = now(),
      last_seen_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.revoke_push_subscription(
  p_player_key text,
  p_session_token uuid,
  p_endpoint text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if party_identity.is_valid(p_player_key, p_session_token) is distinct from true then
    return jsonb_build_object('ok', false, 'code', 'INVALID_SESSION');
  end if;

  delete from public.push_subscriptions
  where player_key = p_player_key
    and endpoint = p_endpoint;

  return jsonb_build_object('ok', true, 'revoked', found);
end;
$$;

revoke all on function public.register_push_subscription(text, uuid, text, text, text)
from public, anon, authenticated;
revoke all on function public.revoke_push_subscription(text, uuid, text)
from public, anon, authenticated;
grant execute on function public.register_push_subscription(text, uuid, text, text, text)
to service_role;
grant execute on function public.revoke_push_subscription(text, uuid, text)
to service_role;

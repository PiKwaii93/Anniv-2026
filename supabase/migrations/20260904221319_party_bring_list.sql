-- Shared guest contribution list. Installing this migration preserves existing party data.
create schema party_bring;
revoke all on schema party_bring from public;
grant usage on schema party_bring to anon, authenticated;

create table party_bring.items (
  id uuid primary key,
  player_key text not null,
  player_name text not null,
  category text not null check (category in ('drink','food','equipment','other')),
  item text not null check (char_length(item) between 1 and 80),
  quantity text check (quantity is null or char_length(quantity) between 1 and 40),
  note text check (note is null or char_length(note) between 1 and 140),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index party_bring_items_category_created on party_bring.items(category, created_at);
create index party_bring_items_player on party_bring.items(player_key);
alter table party_bring.items enable row level security;
revoke all on all tables in schema party_bring from public, anon, authenticated;

create function party_bring.is_admin() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.app_admins where user_id=(select auth.uid()));
$$;

create function party_bring.state(p_player_key text,p_session_token uuid,p_admin boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_admin boolean:=coalesce(p_admin,false); v_items jsonb; v_phase text;
begin
  if v_admin then
    if not party_bring.is_admin() then raise exception 'NOT_ADMIN' using errcode='42501'; end if;
  elsif party_identity.is_valid(p_player_key,p_session_token) is distinct from true then
    raise exception 'IDENTITY_REQUIRED' using errcode='42501';
  end if;
  select phase into v_phase from public.party_state where id='main';
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,'category',i.category,'item',i.item,'quantity',i.quantity,'note',i.note,
    'playerName',i.player_name,'mine',i.player_key is not distinct from p_player_key,
    'canEdit',v_admin or i.player_key is not distinct from p_player_key,
    'createdAt',i.created_at,'updatedAt',i.updated_at
  ) order by i.created_at,i.id),'[]'::jsonb) into v_items from party_bring.items i;
  return jsonb_build_object('ok',true,'phase',v_phase,'items',v_items);
end;
$$;

create function party_bring.act(p_action text,p_payload jsonb,p_player_key text,p_session_token uuid,p_admin boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_admin boolean:=coalesce(p_admin,false); v_name text; v_id uuid; v_category text;
  v_item text; v_quantity text; v_note text; v_owner text; v_phase text;
begin
  if v_admin and not party_bring.is_admin() then raise exception 'NOT_ADMIN' using errcode='42501'; end if;
  if not v_admin or p_action='create' then
    v_name:=party_extras.identity_name(p_player_key,p_session_token);
  end if;
  select phase into v_phase from public.party_state where id='main';
  if p_action in ('create','update') and v_phase='ended' then raise exception 'PARTY_ENDED'; end if;

  if p_action in ('create','update') then
    v_category:=coalesce(p_payload->>'category','');
    v_item:=btrim(coalesce(p_payload->>'item',''));
    v_quantity:=nullif(btrim(coalesce(p_payload->>'quantity','')),'');
    v_note:=nullif(btrim(coalesce(p_payload->>'note','')),'');
    if v_category not in ('drink','food','equipment','other') then raise exception 'INVALID_CATEGORY'; end if;
    if char_length(v_item) not between 1 and 80 or char_length(coalesce(v_quantity,''))>40
      or char_length(coalesce(v_note,''))>140 then raise exception 'INVALID_ITEM'; end if;
  end if;

  if p_action='create' then
    v_id:=(p_payload->>'request_id')::uuid;
    if v_id is null then raise exception 'INVALID_ITEM'; end if;
    if exists(select 1 from party_bring.items where id=v_id) then
      if not exists(select 1 from party_bring.items where id=v_id and player_key=p_player_key) then raise exception 'REQUEST_CONFLICT'; end if;
      return jsonb_build_object('ok',true,'id',v_id);
    end if;
    if (select count(*) from party_bring.items where player_key=p_player_key)>=20 then raise exception 'ITEM_LIMIT'; end if;
    insert into party_bring.items(id,player_key,player_name,category,item,quantity,note)
      values(v_id,p_player_key,v_name,v_category,v_item,v_quantity,v_note);
  elsif p_action='update' then
    v_id:=(p_payload->>'id')::uuid;
    select player_key into v_owner from party_bring.items where id=v_id for update;
    if not found then raise exception 'ITEM_NOT_FOUND'; end if;
    if not v_admin and v_owner is distinct from p_player_key then raise exception 'NOT_ALLOWED' using errcode='42501'; end if;
    update party_bring.items set category=v_category,item=v_item,quantity=v_quantity,note=v_note,updated_at=clock_timestamp() where id=v_id;
  elsif p_action='delete' then
    v_id:=(p_payload->>'id')::uuid;
    delete from party_bring.items where id=v_id and (v_admin or player_key=p_player_key);
    if not found then raise exception 'NOT_ALLOWED' using errcode='42501'; end if;
  else raise exception 'INVALID_ACTION';
  end if;
  return jsonb_build_object('ok',true,'id',v_id);
end;
$$;

create function party_bring.clear_on_epoch() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.data_epoch is distinct from new.data_epoch then delete from party_bring.items where id is not null; end if;
  return new;
end;
$$;
create trigger clear_party_bring_on_epoch after update of data_epoch on public.party_state
for each row execute function party_bring.clear_on_epoch();

create function public.get_party_bring(p_player_key text default null,p_session_token uuid default null,p_admin boolean default false)
returns jsonb language sql stable security invoker set search_path='' as $$
  select party_bring.state(p_player_key,p_session_token,p_admin);
$$;
create function public.party_bring_action(p_action text,p_payload jsonb default '{}',p_player_key text default null,p_session_token uuid default null,p_admin boolean default false)
returns jsonb language sql security invoker set search_path='' as $$
  select party_bring.act(p_action,p_payload,p_player_key,p_session_token,p_admin);
$$;

revoke all on all functions in schema party_bring from public, anon, authenticated;
grant execute on function party_bring.state(text,uuid,boolean),party_bring.act(text,jsonb,text,uuid,boolean) to anon,authenticated;
revoke all on function public.get_party_bring(text,uuid,boolean),public.party_bring_action(text,jsonb,text,uuid,boolean) from public;
grant execute on function public.get_party_bring(text,uuid,boolean),public.party_bring_action(text,jsonb,text,uuid,boolean) to anon,authenticated;
notify pgrst, 'reload schema';

-- Server-only bridge: the Edge Function verifies the JWT before passing the admin ID.
create table party_extras.spotify_connection (
 id boolean primary key default true check(id), client_id text,
 token_secret_id uuid, device_id text, device_name text,
 oauth_state text, oauth_verifier text, oauth_admin uuid, oauth_expires timestamptz,
 lease_id uuid, lease_until timestamptz
);
insert into party_extras.spotify_connection default values;
create table party_extras.spotify_dispatches (
 song_id uuid primary key references party_extras.songs(id) on delete cascade,
 track_uri text not null, state text not null check(state in ('sent','uncertain')),
 created_at timestamptz not null default now()
);
alter table party_extras.spotify_connection enable row level security;
alter table party_extras.spotify_dispatches enable row level security;
revoke all on party_extras.spotify_connection,party_extras.spotify_dispatches from public,anon,authenticated;

create function party_extras.spotify_bridge(p_admin_id uuid,p_op text,p_payload jsonb,p_lease uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c party_extras.spotify_connection%rowtype; secret jsonb; result jsonb; song party_extras.songs%rowtype; sid uuid;
begin
 if not exists(select 1 from public.app_admins where user_id=p_admin_id) then raise exception 'NOT_ADMIN'; end if;
 select * into c from party_extras.spotify_connection where id for update;
 if p_op='acquire' then
   if c.lease_until>clock_timestamp() then raise exception 'SPOTIFY_BUSY'; end if;
   if p_lease is null then raise exception 'INVALID_INPUT'; end if;
   update party_extras.spotify_connection set lease_id=p_lease,lease_until=clock_timestamp()+interval '75 seconds' where id;
   if c.token_secret_id is not null then select decrypted_secret::jsonb into secret from vault.decrypted_secrets where id=c.token_secret_id; end if;
   return jsonb_build_object('client_id',c.client_id,'device_id',c.device_id,'device_name',c.device_name,'tokens',secret,
     'dispatches',coalesce((select jsonb_object_agg(song_id,jsonb_build_object('state',state,'track_uri',track_uri)) from party_extras.spotify_dispatches),'{}'));
 elsif p_op='release' then
   update party_extras.spotify_connection set lease_id=null,lease_until=null where id and lease_id=p_lease;
   return '{}';
 end if;
 if p_lease is null or c.lease_id is distinct from p_lease or not (c.lease_until>clock_timestamp()) then raise exception 'SPOTIFY_BUSY'; end if;
 case p_op
 when 'configure' then
   if c.token_secret_id is not null then raise exception 'DISCONNECT_FIRST'; end if;
   if coalesce(p_payload->>'client_id','') !~ '^[a-fA-F0-9]{32}$' then raise exception 'INVALID_CLIENT'; end if;
   update party_extras.spotify_connection set client_id=p_payload->>'client_id',oauth_state=null,oauth_verifier=null,oauth_admin=null,oauth_expires=null where id;
 when 'begin' then
   if c.client_id is null then raise exception 'INVALID_CLIENT'; end if;
   update party_extras.spotify_connection set oauth_state=p_payload->>'state',oauth_verifier=p_payload->>'verifier',oauth_admin=p_admin_id,oauth_expires=now()+interval '10 minutes' where id;
 when 'consume' then
   if c.oauth_admin is distinct from p_admin_id or c.oauth_state is null or c.oauth_state is distinct from (p_payload->>'state') or not (c.oauth_expires>now()) then raise exception 'OAUTH_EXPIRED'; end if;
   result:=jsonb_build_object('verifier',c.oauth_verifier,'client_id',c.client_id);
   update party_extras.spotify_connection set oauth_state=null,oauth_verifier=null,oauth_admin=null,oauth_expires=null where id;
   return result;
 when 'tokens' then
   if c.token_secret_id is null then
     select vault.create_secret(p_payload::text) into sid;
     update party_extras.spotify_connection set token_secret_id=sid where id;
   else perform vault.update_secret(c.token_secret_id,p_payload::text); end if;
 when 'disconnect' then
   if c.token_secret_id is not null then delete from vault.secrets where id=c.token_secret_id; end if;
   update party_extras.spotify_connection set token_secret_id=null,device_id=null,device_name=null,oauth_state=null,oauth_verifier=null,oauth_admin=null,oauth_expires=null where id;
 when 'device' then
   update party_extras.spotify_connection set device_id=p_payload->>'id',device_name=p_payload->>'name' where id;
 when 'song' then
   select * into song from party_extras.songs where id=(p_payload->>'song_id')::uuid;
   if not found or song.status not in ('pending','queued') then raise exception 'SONG_NOT_READY'; end if;
   return jsonb_build_object('link',song.link,'title',song.title,'artist',song.artist);
 when 'claim_song' then
   select * into song from party_extras.songs where id=(p_payload->>'song_id')::uuid for update;
   if not found or song.status not in ('pending','queued') then raise exception 'SONG_NOT_READY'; end if;
   if exists(select 1 from party_extras.spotify_dispatches where song_id=song.id) then raise exception 'ALREADY_DISPATCHED'; end if;
   if coalesce(p_payload->>'uri','') !~ '^spotify:track:[a-zA-Z0-9]{22}$' then raise exception 'TRACK_LINK_REQUIRED'; end if;
   insert into party_extras.spotify_dispatches(song_id,track_uri,state) values(song.id,p_payload->>'uri','uncertain');
 when 'sent' then
   update party_extras.spotify_dispatches set state='sent' where song_id=(p_payload->>'song_id')::uuid;
   update party_extras.songs set status='queued' where id=(p_payload->>'song_id')::uuid and status='pending';
 when 'failed' then
   delete from party_extras.spotify_dispatches where song_id=(p_payload->>'song_id')::uuid and state='uncertain';
 when 'resolve' then
   if p_payload->>'resolution'='sent' then
     update party_extras.spotify_dispatches set state='sent' where song_id=(p_payload->>'song_id')::uuid and state='uncertain';
     update party_extras.songs set status='queued' where id=(p_payload->>'song_id')::uuid and status='pending';
   elsif p_payload->>'resolution'='absent' then
     delete from party_extras.spotify_dispatches where song_id=(p_payload->>'song_id')::uuid and state='uncertain';
   else raise exception 'INVALID_INPUT'; end if;
 else raise exception 'INVALID_ACTION';
 end case;
 return '{}';
end;
$$;
revoke all on function party_extras.spotify_bridge(uuid,text,jsonb,uuid) from public,anon,authenticated;
grant usage on schema party_extras to service_role;
grant execute on function party_extras.spotify_bridge(uuid,text,jsonb,uuid) to service_role;
create function public.spotify_bridge(p_admin_id uuid,p_op text,p_payload jsonb default '{}',p_lease uuid default null)
returns jsonb language sql security invoker set search_path='' as $$ select party_extras.spotify_bridge(p_admin_id,p_op,p_payload,p_lease); $$;
revoke all on function public.spotify_bridge(uuid,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.spotify_bridge(uuid,text,jsonb,uuid) to service_role;

create function party_extras.protect_spotify_dispatch() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='rejected' and exists(select 1 from party_extras.spotify_dispatches where song_id=new.id) then raise exception 'SPOTIFY_ALREADY_SENT'; end if;
 return new;
end;
$$;
revoke all on function party_extras.protect_spotify_dispatch() from public,anon,authenticated;
create trigger protect_spotify_dispatch before update of status on party_extras.songs for each row execute function party_extras.protect_spotify_dispatch();

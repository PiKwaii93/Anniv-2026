-- The CLI is unavailable in this workspace. Apply via the configured connector,
-- then archive this source under the migration version returned by Supabase.
create table party_extras.spotify_guest_limits (
 player_key text primary key, window_at timestamptz not null, requests integer not null
);
alter table party_extras.spotify_guest_limits enable row level security;
revoke all on party_extras.spotify_guest_limits from public,anon,authenticated;

-- Service-only narrow operations. Identity is the existing private party session,
-- not a claimed admin ID; this never grants guests direct vault/table access.
create function party_extras.spotify_guest_bridge(p_identity jsonb,p_op text,p_payload jsonb,p_lease uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 k text := p_identity->>'player_key';
 n text; cfg party_extras.settings%rowtype; c party_extras.spotify_connection%rowtype;
 s party_extras.songs%rowtype; sid uuid := (p_payload->>'song_id')::uuid;
 secret jsonb; dispatch text; v_requests integer;
begin
 if p_op='release' then
   update party_extras.spotify_connection set lease_id=null,lease_until=null where id and lease_id=p_lease;
   return '{}';
 end if;
 n := party_extras.identity_name(k,(p_identity->>'session_token')::uuid);
 select * into cfg from party_extras.settings where id for update;
 select * into c from party_extras.spotify_connection where id for update;
 if p_op='acquire' then
   if not cfg.jukebox_visible or not cfg.jukebox_open or (select phase from public.party_state where id='main')='ended' then raise exception 'JUKEBOX_CLOSED'; end if;
   if sid is not null then
     select * into s from party_extras.songs where id=sid;
     if found then
       if s.player_key<>k then raise exception 'SONG_NOT_READY'; end if;
       select state into dispatch from party_extras.spotify_dispatches where song_id=sid;
       if dispatch is null and s.status not in ('pending','queued') then raise exception 'SONG_NOT_READY'; end if;
     end if;
   end if;
   if s.id is null and (select count(*) from party_extras.songs where player_key=k)>=3 then raise exception 'SONG_LIMIT'; end if;
   insert into party_extras.spotify_guest_limits as lim values(k,clock_timestamp(),1)
   on conflict(player_key) do update set
     requests=case when lim.window_at<clock_timestamp()-interval '1 minute' then 1 else lim.requests+1 end,
     window_at=case when lim.window_at<clock_timestamp()-interval '1 minute' then clock_timestamp() else lim.window_at end
   returning lim.requests into v_requests;
   if v_requests>20 then raise exception 'SEARCH_RATE_LIMIT'; end if;
   if p_lease is null then raise exception 'INVALID_INPUT'; end if;
   if c.lease_until>clock_timestamp() then raise exception 'SPOTIFY_BUSY'; end if;
   update party_extras.spotify_connection set lease_id=p_lease,lease_until=clock_timestamp()+interval '75 seconds' where id;
   if c.token_secret_id is not null then select decrypted_secret::jsonb into secret from vault.decrypted_secrets where id=c.token_secret_id; end if;
   return jsonb_build_object('client_id',c.client_id,'tokens',secret,'device_id',c.device_id,'dispatch',dispatch,'title',s.title);
 end if;
 if p_lease is null or c.lease_id is distinct from p_lease or not(c.lease_until>clock_timestamp()) then raise exception 'SPOTIFY_BUSY'; end if;
 if p_op='tokens' then
   if c.token_secret_id is null then raise exception 'SONG_NOT_READY'; end if;
   perform vault.update_secret(c.token_secret_id,p_payload::text);
   return '{}';
 end if;
 if sid is null then raise exception 'INVALID_INPUT'; end if;
 select * into s from party_extras.songs where id=sid for update;
 if found and s.player_key<>k then raise exception 'SONG_NOT_READY'; end if;
 if p_op in ('prepare','claim_song') then
   if not cfg.jukebox_visible or not cfg.jukebox_open or (select phase from public.party_state where id='main')='ended' then raise exception 'JUKEBOX_CLOSED'; end if;
   if s.id is not null and s.status not in ('pending','queued') then raise exception 'SONG_NOT_READY'; end if;
   if exists(select 1 from party_extras.spotify_dispatches where song_id=sid) then raise exception 'QUEUE_UNCERTAIN'; end if;
 end if;
 case p_op
 when 'prepare' then
   if coalesce(p_payload->>'link','') !~ '^https://open\.spotify\.com/track/[a-zA-Z0-9]{22}$' then raise exception 'INVALID_INPUT'; end if;
   if s.id is null and (select count(*) from party_extras.songs where player_key=k)>=3 then raise exception 'SONG_LIMIT'; end if;
   if exists(select 1 from party_extras.songs where id<>sid and
     (link=p_payload->>'link' or (lower(btrim(title))=lower(btrim(p_payload->>'title')) and lower(btrim(artist))=lower(btrim(p_payload->>'artist'))))) then raise exception 'SONG_EXISTS'; end if;
   if s.id is null then
     insert into party_extras.songs(id,player_key,player_name,title,artist,link)
     values(sid,k,n,p_payload->>'title',p_payload->>'artist',p_payload->>'link');
   else
     -- Changing the target invalidates old votes, never another guest's proposal.
     if s.link is distinct from p_payload->>'link' then delete from party_extras.votes where song_id=sid; end if;
     update party_extras.songs set title=p_payload->>'title',artist=p_payload->>'artist',link=p_payload->>'link' where id=sid;
   end if;
 when 'claim_song' then
   if s.id is null or coalesce(p_payload->>'uri','') !~ '^spotify:track:[a-zA-Z0-9]{22}$'
     or s.link is distinct from 'https://open.spotify.com/track/'||split_part(p_payload->>'uri',':',3) then raise exception 'INVALID_INPUT'; end if;
   insert into party_extras.spotify_dispatches(song_id,track_uri,state) values(sid,p_payload->>'uri','uncertain');
 when 'sent' then
   if s.id is null then raise exception 'SONG_NOT_READY'; end if;
   update party_extras.spotify_dispatches set state='sent' where song_id=sid;
   if not found then raise exception 'SONG_NOT_READY'; end if;
   update party_extras.songs set status='queued' where id=sid and status='pending';
 when 'failed' then
   if s.id is null then raise exception 'SONG_NOT_READY'; end if;
   delete from party_extras.spotify_dispatches where song_id=sid and state='uncertain';
 else raise exception 'INVALID_INPUT';
 end case;
 return '{}';
end;
$$;
revoke all on function party_extras.spotify_guest_bridge(jsonb,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function party_extras.spotify_guest_bridge(jsonb,text,jsonb,uuid) to service_role;
create function public.spotify_guest_bridge(p_identity jsonb,p_op text,p_payload jsonb default '{}',p_lease uuid default null)
returns jsonb language sql security invoker set search_path='' as $$ select party_extras.spotify_guest_bridge(p_identity,p_op,p_payload,p_lease); $$;
revoke all on function public.spotify_guest_bridge(jsonb,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.spotify_guest_bridge(jsonb,text,jsonb,uuid) to service_role;

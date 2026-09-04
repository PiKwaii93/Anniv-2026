-- Database-only integration test. ALWAYS rollback. Never call Storage.remove.
begin;
set local plpgsql.check_asserts=on;
set local lock_timeout='3s';
set local statement_timeout='20s';
do $$
#variable_conflict use_variable
declare
  admin_id uuid; guest_id uuid:=gen_random_uuid(); token uuid:=gen_random_uuid();
  request_id uuid:=gen_random_uuid(); fresh uuid:=gen_random_uuid(); k text;
  result jsonb; denied boolean; rec record; snapshot jsonb; old_epoch bigint;
  keep_tables text[]:=array['public.guests','public.plus_ones','public.guest_private_notes','public.app_admins',
    'public.bingo_prompts','public.live_vote_questions','public.secret_mission_prompts','public.photo_hunt_challenges',
    'public.iceberg_entries','party_extras.duo_prompts','party_extras.spotify_connection','party_chat.settings'];
  cleared_tables text[]:=array['party_chat.messages','party_chat.reads','party_extras.songs','party_extras.votes',
    'party_extras.spotify_dispatches','party_extras.spotify_guest_limits','party_extras.letters',
    'party_extras.duo_queue','party_extras.duo_matches','public.photo_hunt_submissions','public.photo_hunt_upload_slots',
    'public.live_vote_votes','public.live_vote_rounds','public.live_vote_players','public.secret_mission_history',
    'public.secret_mission_scoreboard','public.secret_mission_players','public.party_identity_sessions'];
  table_name text; row_count bigint; storage_before jsonb; settings_before jsonb;
begin
  select user_id into admin_id from public.app_admins limit 1;
  assert admin_id is not null;
  insert into public.guests(id,name,status) values(guest_id,'QA Data Reset','confirmed');
  k:='guest:'||guest_id;
  assert public.claim_party_identity(k,token)->>'ok'='true';
  assert public.claim_live_vote_identity(k,token)->>'ok'='true';
  perform public.claim_secret_mission(k,token);
  update public.live_vote_players set score=17 where player_key=k;
  select data_epoch into old_epoch from public.party_state where id='main';
  create temp table data_reset_preserved(name text primary key,contents jsonb) on commit drop;
  foreach table_name in array keep_tables loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]'') from %s t',table_name) into snapshot;
    insert into data_reset_preserved values(table_name,snapshot);
  end loop;
  select coalesce(jsonb_agg(to_jsonb(o) order by id),'[]') into storage_before from storage.objects o;
  select to_jsonb(s)-'credits_run' into settings_before from party_extras.settings s where id;

  set local role anon;
  perform set_config('request.jwt.claim.sub','',true);
  assert public.party_data_epoch()=old_epoch;
  denied:=false;
  begin perform public.admin_reset_party_data(request_id,'EFFACER'); exception when insufficient_privilege then denied:=true; end;
  assert denied,'Anonymous cannot reset';
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',guest_id::text,true);
  denied:=false;
  begin perform public.admin_reset_party_data(request_id,'EFFACER'); exception when insufficient_privilege then denied:=true; end;
  assert denied,'Nonadmin cannot reset';
  denied:=false;
  begin perform public.admin_party_reset_status(); exception when insufficient_privilege then denied:=true; end;
  assert denied,'Cleanup paths are admin-only';
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  denied:=false;
  begin perform public.admin_reset_party_data(request_id,''); exception when others then denied:=sqlerrm='CONFIRMATION_REQUIRED'; end;
  assert denied,'Typed confirmation enforced on server';
  reset role;
  update public.party_state set phase='live' where id='main';
  set local role authenticated;
  denied:=false;
  begin perform public.admin_reset_party_data(request_id,'EFFACER'); exception when others then denied:=sqlerrm='PREPARATION_REQUIRED'; end;
  assert denied,'Cannot erase a live party';
  reset role;
  update public.party_state set phase='preparation' where id='main';
  set local role authenticated;
  result:=public.admin_reset_party_data(request_id,'EFFACER');
  assert result->>'id'=request_id::text;
  assert (result->>'epoch')::bigint=old_epoch+1;
  reset role;
  foreach table_name in array cleared_tables loop
    execute format('select count(*) from %s',table_name) into row_count;
    assert row_count=0,'Not cleared: '||table_name;
  end loop;
  foreach table_name in array keep_tables loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]'') from %s t',table_name) into snapshot;
    assert snapshot=(select contents from data_reset_preserved where name=table_name),'Preserved data changed: '||table_name;
  end loop;
  assert settings_before=(select to_jsonb(s)-'credits_run' from party_extras.settings s where id),'Visibility/open settings preserved';
  assert storage_before=(select coalesce(jsonb_agg(to_jsonb(o) order by id),'[]') from storage.objects o),'SQL must not remove Storage objects';
  assert not exists(select 1 from storage.objects o where bucket_id='photo-hunt' and not exists(select 1 from party_reset.photo_cleanup q where q.request_id=request_id and q.path=o.name)),'Exact file targets durably queued';
  assert (select state->>'phase'='idle' from public.live_vote_public_state where id='main');
  assert (select state->'teams'='[]'::jsonb from public.beer_pong_state where id='main');
  assert (select not is_active from public.party_announcements where id='main');
  set local role anon;
  perform set_config('request.jwt.claim.sub','',true);
  assert not public.party_identity_is_valid(k,token);
  assert public.claim_party_identity(k,token)->>'code'='INVALID_SESSION';
  assert public.claim_party_identity(k,fresh)->>'ok'='true';
  assert public.claim_live_vote_identity(k,fresh)->>'score'='0','New game starts at zero';
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  result:=public.admin_reset_party_data(request_id,'EFFACER');
  assert (result->>'epoch')::bigint=old_epoch+1,'Same request does not reset again';
  reset role;
  assert exists(select 1 from public.party_identity_sessions where player_key=k),'Retry preserves newly reconnected guest';
  set local role authenticated;
  result:=public.admin_ack_party_reset_photos(request_id,array(select jsonb_array_elements_text(result->'paths')));
  reset role;
  assert not exists(select 1 from storage.objects o where bucket_id='photo-hunt' and not exists(select 1 from party_reset.photo_cleanup q where q.request_id=request_id and q.path=o.name)),'Cannot acknowledge files that still exist';
end;
$$;
rollback;

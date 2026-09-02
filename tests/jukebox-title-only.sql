-- No production submissions or settings remain after this test.
begin;
do $$
declare
 g uuid := gen_random_uuid(); token uuid := gen_random_uuid(); k text;
 denied boolean := false; submitted jsonb;
begin
 k := 'guest:' || g;
 insert into public.guests(id,name,status) values(g,'QA title-only','confirmed');
 insert into public.party_identity_sessions(player_key,player_name,session_token) values(k,'QA title-only',token);
 update party_extras.settings set jukebox_visible=true,jukebox_open=true where id;
 update public.party_state set phase='live' where id='main';
 set local role anon;
 perform set_config('request.jwt.claim.sub','',true);
 perform public.party_extras_action('song_submit',jsonb_build_object('title',g::text),k,token);
 select s into submitted from jsonb_array_elements(public.get_party_extras(k,token)->'songs') s where s->>'title'=g::text;
 assert submitted->>'artist'='', 'Omitted artist must be accepted';
 assert submitted->>'status'='pending', 'Submission still needs moderation';
 assert submitted->>'link'='', 'A URL must not be required';
 begin
   perform public.party_extras_action('song_submit','{"title":""}',k,token);
 exception when check_violation then denied:=true; end;
 assert denied,'Blank titles must remain invalid';
 denied:=false;
 begin
   perform public.party_extras_action('song_submit',jsonb_build_object('title','Too long','artist',repeat('a',101)),k,token);
 exception when check_violation then denied:=true; end;
 assert denied,'Artist length still bounded';
 denied:=false;
 begin
   perform public.party_extras_action('song_submit','{"title":"Wrong identity"}',k,gen_random_uuid());
 exception when others then denied:=sqlerrm='IDENTITY_REQUIRED'; end;
 assert denied,'Guest authentication remains required';
 perform public.party_extras_action('song_submit',jsonb_build_object('title',g::text||' two'),k,token);
 perform public.party_extras_action('song_submit',jsonb_build_object('title',g::text||' three'),k,token);
 denied:=false;
 begin
   perform public.party_extras_action('song_submit',jsonb_build_object('title',g::text||' four'),k,token);
 exception when others then denied:=sqlerrm='SONG_LIMIT'; end;
 assert denied,'Three-proposal quota remains enforced';
 reset role;
end;
$$;
select 'PASS: title-only submission, moderation, required title, artist length, identity and quota' as result;
rollback;

-- Run as the project database owner. The fixture and every attempted write
-- are rolled back; no existing prompt or admin identity is modified.
begin;

insert into public.bingo_prompts (text, is_active, sort_order)
values ('Bingo inactive access regression fixture', false, 999999);

set local role anon;
do $$
declare n integer;
begin
  select count(*) into n from (
    select id,text from public.bingo_prompts where is_active
    order by sort_order,created_at limit 16
  ) p;
  if n <> 16 then raise exception 'Guest must receive a complete grid'; end if;
  if exists(select 1 from public.bingo_prompts where not is_active) then
    raise exception 'Inactive prompts exposed to guests';
  end if;
  begin
    perform user_id from public.app_admins;
    raise exception 'Private admin registry exposed to guests';
  exception when insufficient_privilege then null;
  end;
  if has_table_privilege(current_user,'public.bingo_prompts','INSERT')
     or has_table_privilege(current_user,'public.bingo_prompts','UPDATE')
     or has_table_privilege(current_user,'public.bingo_prompts','DELETE')
     or has_table_privilege(current_user,'public.bingo_prompts','TRUNCATE') then
    raise exception 'Guest write privileges must be absent';
  end if;
end $$;

reset role;
-- An empty subject is deliberately not an existing user or borrowed identity.
set local request.jwt.claims = '{"role":"authenticated"}';
set local role authenticated;
do $$
declare affected integer;
begin
  if auth.uid() is not null then raise exception 'Unexpected test identity'; end if;
  if (select count(*) from public.bingo_prompts where is_active) < 16 then
    raise exception 'Ordinary authenticated clients must be able to play';
  end if;
  if exists(select 1 from public.bingo_prompts where not is_active) then
    raise exception 'Inactive prompts exposed to non-admin';
  end if;
  begin
    insert into public.bingo_prompts (text,is_active) values ('Forbidden write fixture',true);
    raise exception 'Non-admin insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  update public.bingo_prompts set is_active=false where is_active;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Non-admin update unexpectedly succeeded'; end if;
  delete from public.bingo_prompts;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Non-admin delete unexpectedly succeeded'; end if;
  if has_table_privilege(current_user,'public.bingo_prompts','TRUNCATE') then
    raise exception 'TRUNCATE bypasses row policies and must be absent';
  end if;
end $$;
reset role;

do $$
begin
  if not (select relrowsecurity from pg_class where oid='public.bingo_prompts'::regclass) then
    raise exception 'Bingo RLS must remain enabled';
  end if;
  if exists(select 1 from pg_policies where schemaname='public' and tablename='bingo_prompts'
            and policyname like 'Admins can %' and roles <> array['authenticated']::name[]) then
    raise exception 'Admin policies must target authenticated only';
  end if;
end $$;

rollback;

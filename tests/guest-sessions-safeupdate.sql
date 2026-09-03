-- Optional integration runner for a DB session allowed to load safeupdate.
-- psql -X -v ON_ERROR_STOP=1 -f tests/guest-sessions-safeupdate.sql
-- All fixture/content/session mutations are rolled back by the included suite.
\set ON_ERROR_STOP on
load 'safeupdate';
set safeupdate.enabled=on;
begin;
create temporary table reset_guard_probe(id integer primary key, value integer) on commit drop;
insert into reset_guard_probe values(1,0);
do $$
declare denied boolean:=false;
begin
  begin
    update reset_guard_probe set value=1;
  exception when others then
    denied:=sqlerrm='UPDATE requires a WHERE clause';
  end;
  if not denied then raise exception 'Safeupdate guard is not active'; end if;
end;
$$;
rollback;
\ir guest-sessions.sql

-- The two roles every database gets, run once per database as its owner (06 §1). Neon: as `neondb_owner` in the SQL
-- editor or psql, never through the Console, API, CLI or alchemy, which put a role in `neon_superuser` and so give it
-- BYPASSRLS: `insyte_app` would skip every policy without a word. Passwords are set separately (`alter role … password`).
--
-- insyte_owner owns the schema and runs migrations. insyte_app is what the Workers connect as: it reads and writes
-- rows, through row level security, and owns nothing.
create role insyte_owner login nosuperuser nobypassrls;
create role insyte_app login nosuperuser nobypassrls noinherit;

-- On PG16+ the role that creates insyte_owner may administer it but not act as it, and both statements below need to
-- (ownership and default privileges are given as that role). The grant runs one way: insyte_owner gains nothing.
grant insyte_owner to current_user;

grant connect on database insyte to insyte_app;
grant connect, create on database insyte to insyte_owner;
alter schema public owner to insyte_owner;
grant usage on schema public to insyte_app;

alter default privileges for role insyte_owner in schema public
  grant select, insert, update, delete on tables to insyte_app;
alter default privileges for role insyte_owner in schema public
  grant usage, select on sequences to insyte_app;
alter default privileges for role insyte_owner in schema public
  grant execute on functions to insyte_app;

-- Not a trusted extension, so the migrations (as insyte_owner) cannot create it. Neon preloads it; locally it exists
-- but its view stays empty.
create extension if not exists pg_stat_statements;

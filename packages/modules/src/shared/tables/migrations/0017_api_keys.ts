import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/**
 * API keys and what they did (M19.1). A key's token is `ins_live_<lookup>_<secret>`: the lookup finds the key, the
 * secret proves it, and only an HMAC of the secret (keyed from the server's secret, never stored) is kept. A rotation
 * gives a new lookup and secret; the previous pair keeps working until `grace_until`. A key holds a role (and follows it)
 * or its own scopes, narrowed by stores, an expiry and an IP allow list.
 *
 * `api_key_route` is the one way in before a workspace is known, as the invitation routes are (0014): it answers which
 * workspace and key a lookup names, nothing else, as `system` for its own duration.
 */
export default statements(
  `create table api_keys (
     id              text primary key,
     workspace_id    text not null references workspaces(id) on delete cascade,
     label           text not null check (length(trim(label)) between 1 and 80),
     lookup          text not null unique,
     prefix          text not null,
     secret_hash     bytea not null,
     access          jsonb not null,
     stores          jsonb not null default '"all"',
     expires_at      timestamptz,
     ips             text[] not null default '{}',
     agent           boolean not null default false,
     created_by      text not null,
     created_at      timestamptz not null default now(),
     last_used_at    timestamptz,
     revoked_at      timestamptz,
     revoked_by      text,
     previous_lookup text unique,
     previous_prefix text,
     previous_hash   bytea,
     grace_until     timestamptz
   )`,
  "create index api_keys_workspace on api_keys (workspace_id, created_at desc)",
  tenantTable("api_keys", { membersOnly: true }),
  `create table api_requests (
     id           bigint generated always as identity primary key,
     workspace_id text not null references workspaces(id) on delete cascade,
     key_id       text not null references api_keys(id) on delete cascade,
     method       text not null,
     path         text not null,
     status       int not null,
     ms           int not null,
     ip           text,
     at           timestamptz not null default now()
   )`,
  "create index api_requests_key on api_requests (key_id, at desc)",
  tenantTable("api_requests", { membersOnly: true }),
  "create policy api_keys_routing on api_keys as permissive for select to insyte_owner using (true)",
  `create function api_key_route(key_lookup text) returns table (workspace_id text, key_id text)
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       return query
         select k.workspace_id, k.id from api_keys k
         where k.lookup = key_lookup or (k.previous_lookup = key_lookup and k.grace_until > now());
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function api_key_route(text) from public",
  "grant execute on function api_key_route(text) to insyte_app"
)

import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/**
 * Outbound webhooks (M19.4): the operator's endpoints, and every delivery Insyte made to them.
 *
 * - `webhook_endpoints`: the URL (https only, checked again on every attempt), the events it takes, the payload's API
 *   version, the stores, extra headers (`[{ key, sealed }]`, the value sealed), the retry policy (0, 3, 5 or 8
 *   attempts) and the operator's switch. The signing secret is sealed (`secret_sealed`; the sender needs it back to
 *   sign), with its first characters kept to show; a rotation keeps the previous one signing beside it until
 *   `previous_valid_until`. `consecutive_failures` counts failed attempts in a row; at five, `auto_disabled_at`.
 *   Removing is soft (`deleted_at`), for its Undo.
 * - `webhook_deliveries`: one row per event per endpoint (its id is `Insyte-Delivery`, derived from the event and the
 *   endpoint, so a relay that runs twice makes one), and one per test or redelivery. The body as sent, the signature
 *   header, the last attempt's status, time and the start of the answer, the attempts and the next one's time. Kept
 *   30 days: `webhook_deliveries_expire()` deletes older rows, for the 15-minute sweep, as `system`.
 */
export default statements(
  `create table webhook_endpoints (
     id                     text primary key,
     workspace_id           text not null references workspaces(id) on delete cascade,
     url                    text not null check (url ~ '^https://'),
     description            text not null default '' check (length(description) <= 200),
     events                 text[] not null check (cardinality(events) >= 1),
     api_version            text not null,
     stores                 jsonb not null default '"all"',
     secret_sealed          text not null,
     secret_prefix          text not null,
     secret_rotated_at      timestamptz,
     previous_secret_sealed text,
     previous_valid_until   timestamptz,
     headers                jsonb not null default '[]',
     retry                  int not null default 5 check (retry in (0, 3, 5, 8)),
     active                 boolean not null default true,
     auto_disabled_at       timestamptz,
     consecutive_failures   int not null default 0,
     created_by             text not null,
     created_at             timestamptz not null default now(),
     updated_at             timestamptz not null default now(),
     deleted_at             timestamptz
   )`,
  "create index webhook_endpoints_workspace on webhook_endpoints (workspace_id, created_at desc) where deleted_at is null",
  tenantTable("webhook_endpoints", { membersOnly: true }),
  `create table webhook_deliveries (
     id               text primary key,
     workspace_id     text not null references workspaces(id) on delete cascade,
     endpoint_id      text not null references webhook_endpoints(id) on delete cascade,
     event_id         text not null,
     event            text not null,
     test             boolean not null default false,
     redelivery_of    text,
     body             jsonb not null,
     signature        text,
     outcome          text not null default 'pending'
                        check (outcome in ('pending', 'retrying', 'delivered', 'failed', 'cancelled')),
     status           int,
     error            text,
     ms               int,
     response_snippet text,
     attempts         int not null default 0,
     max_attempts     int not null check (max_attempts between 1 and 8),
     next_attempt_at  timestamptz,
     created_at       timestamptz not null default now(),
     attempted_at     timestamptz
   )`,
  "create index webhook_deliveries_endpoint on webhook_deliveries (endpoint_id, created_at desc)",
  "create index webhook_deliveries_age on webhook_deliveries (created_at)",
  tenantTable("webhook_deliveries", { membersOnly: true }),
  "create policy webhook_deliveries_expire on webhook_deliveries as permissive for delete to insyte_owner using (true)",
  `create function webhook_deliveries_expire() returns int
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     declare gone int;
     begin
       perform set_config('app.principal_kind', 'system', true);
       delete from webhook_deliveries where created_at < now() - interval '30 days';
       get diagnostics gone = row_count;
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
       return gone;
     end $$`,
  "revoke all on function webhook_deliveries_expire() from public",
  "grant execute on function webhook_deliveries_expire() to insyte_app"
)

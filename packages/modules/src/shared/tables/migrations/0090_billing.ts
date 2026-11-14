import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * Billing (M13 step 1; widgets/05 §4): what Stripe says about the workspace's own subscription to Insyte, cached so the
 * page reads it without asking Stripe. Stripe is the truth; these rows follow its webhooks and the answers to Insyte's
 * own calls. Additive only.
 *
 * - `subscriptions`: one per workspace, made at the first paid action with the Stripe customer. `stripe_subscription_id`
 *   and `status` stay empty until a subscription exists (a trial is `workspaces.trial_ends_at`, not a row here).
 *   `extra_seats` are the seats bought beyond the plan's; the team's seats read them (`Members.seats`). `event_at` is
 *   the newest Stripe event applied, so an older one that arrives late does not roll the row back. `started_by` is
 *   the person whose first paid action made the row, and `started_at` when the subscription first paid, so the product
 *   event is counted once. `checkout_session_id` is the Checkout page opened for the first payment, with the change it
 *   was opened for (`checkout_key`) and the attempt that claimed it (`checkout_nonce`, Stripe's idempotency key for that
 *   page): opened again for the same change it is reused, for another it is expired first, and two tabs cannot both
 *   claim it, so no workspace has two pages it can pay. `second_subscription_id` is another subscription Stripe bills
 *   the same customer for while this one bills too: shown on the page until it ends, never cancelled by Insyte.
 * - `invoices`: Stripe's invoices for the workspace, by Stripe's id, newest first. Links are Stripe's hosted page and
 *   PDF; amounts are minor units in the invoice's currency.
 * - `billing_route(customer, workspace)`: a webhook's workspace, read before any workspace is in scope: by the
 *   customer Insyte made, or by the workspace id Insyte put in Stripe's metadata, if that workspace exists.
 * - Stripe's webhook deliveries go into `inbound_events` (provider `stripe`, the event id as the delivery id), which
 *   dedupes them.
 */
export default statements(
  `create table subscriptions (
     workspace_id           text primary key references workspaces(id) on delete cascade,
     stripe_customer_id     text not null unique,
     stripe_subscription_id text unique,
     status                 text check (status in ('trialing', 'active', 'past_due', 'canceled', 'unpaid',
                                                   'incomplete', 'incomplete_expired', 'paused')),
     plan                   text check (plan in ('starter', 'growth', 'scale')),
     cycle                  text check (cycle in ('monthly', 'annual')),
     extra_seats            integer not null default 0 check (extra_seats between 0 and 500),
     currency               text,
     current_period_end     timestamptz,
     cancel_at              timestamptz,
     cancel_reason          text check (cancel_reason in ('too_expensive', 'missing_feature', 'closing_store',
                                                          'switched_tool', 'other')),
     cancel_note            text check (length(cancel_note) <= 2000),
     card_brand             text,
     card_last4             text check (card_last4 ~ '^[0-9]{4}$'),
     card_expiry            text check (card_expiry ~ '^[0-9]{2}/[0-9]{4}$'),
     started_by             text,
     started_at             timestamptz,
     checkout_session_id    text,
     checkout_key           text,
     checkout_nonce         text,
     second_subscription_id text,
     event_at               timestamptz,
     created_at             timestamptz not null default now(),
     updated_at             timestamptz not null default now(),
     check ((stripe_subscription_id is null) = (status is null))
   )`,
  tenantTable("subscriptions", { membersOnly: true }),
  "create trigger subscriptions_touch before update on subscriptions for each row execute function touch_updated_at()",
  `create table invoices (
     id                 text primary key,
     workspace_id       text not null references workspaces(id) on delete cascade,
     number             text,
     status             text not null check (status in ('draft', 'open', 'paid', 'uncollectible', 'void')),
     amount_minor       bigint not null,
     currency           text not null,
     issued_at          timestamptz not null,
     hosted_url         text,
     pdf_url            text,
     event_at           timestamptz,
     created_at         timestamptz not null default now()
   )`,
  "create index invoices_newest on invoices (workspace_id, issued_at desc, id desc)",
  tenantTable("invoices", { membersOnly: true }),
  // Routing reads for the function below, which runs as `insyte_owner` and so sees no workspace's rows otherwise.
  "create policy subscriptions_routing on subscriptions as permissive for select to insyte_owner using (true)",
  `create function billing_route(customer text, workspace text) returns table (workspace_id text)
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       return query
         select r.id from (
           select s.workspace_id as id, 0 as rank from subscriptions s where s.stripe_customer_id = customer
           union all
           select w.id, 1 from workspaces w where w.id = workspace and w.deleted_at is null
         ) r order by r.rank limit 1;
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function billing_route(text, text) from public",
  "grant execute on function billing_route(text, text) to insyte_app"
)

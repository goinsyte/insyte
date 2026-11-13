import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * Disputes (M13 step 3, the read side of step 4; domain.md §8, §12.6): the chargebacks a payment provider opens or the
 * team opens by hand ("Nieuw bewijspakket"), the evidence gathered for each, and each case's timeline.
 *
 * - `chargebacks`: one case, in the workspace's currency when made by hand, numbered `DSP-n` from
 *   `workspace_counters(chargeback)` unless the team types its own number or the provider has one. `reason` is the
 *   normalised reason analytics groups by; `reason_code` the finer one the case was opened with (the dialog's seven, a
 *   provider's own code later). A manual case has its deadline fourteen days out. The provider columns stay empty until
 *   a payment connection brings disputes in (M13 step 2). A case about an order sits in that order's store, so a role
 *   fenced to stores sees only its own; one by hand without an order is the whole team's.
 * - `evidence_items`: what the case's pack holds, in order: an uploaded file now, what Insyte gathers later (step 4).
 *   A removed item keeps its row (`removed_at`) so its undo puts it back where it was.
 * - `chargeback_events`: the timeline. A deadline reminder is an event too, once per offset per deadline, which is
 *   what keeps the hourly sweep from saying it twice.
 * - The queue on Start gains `chargeback_deadline`, one row per case that needs evidence, and sweeps the workspaces
 *   that have one even without a store; the hourly reminder sweep reads which workspaces have a deadline coming.
 */
export default statements(
  `create table chargebacks (
     id                  text primary key,
     workspace_id        text not null references workspaces(id) on delete cascade,
     store_id            text references stores(id) on delete set null,
     provider            text not null check (provider in ('stripe', 'klarna', 'paypal')),
     connection_id       text references connections(id) on delete set null,
     provider_dispute_id text,
     case_number         text not null check (btrim(case_number) <> '' and char_length(case_number) <= 40),
     order_id            text references orders(id) on delete set null,
     customer_id         text references customers(id) on delete set null,
     customer_name       text not null check (btrim(customer_name) <> '' and char_length(customer_name) <= 200),
     amount_minor        bigint not null check (amount_minor > 0),
     currency            char(3) not null,
     reason              text not null
                           check (reason in ('item_not_received', 'not_as_described', 'unauthorized', 'duplicate',
                                             'other')),
     reason_code         text not null check (btrim(reason_code) <> '' and char_length(reason_code) <= 60),
     status              text not null default 'awaiting_evidence'
                           check (status in ('open', 'awaiting_evidence', 'submitted', 'won', 'lost')),
     deadline_at         timestamptz not null,
     opened_at           timestamptz not null default now(),
     submitted_at        timestamptz,
     submitted_by        text,
     accepted_at         timestamptz,
     accepted_by         text,
     outcome_at          timestamptz,
     note                text not null default '' check (char_length(note) <= 2000),
     created_manually    boolean not null default false,
     created_by          text,
     raw                 jsonb,
     created_at          timestamptz not null default now(),
     updated_at          timestamptz not null default now()
   )`,
  "create unique index chargebacks_case on chargebacks (workspace_id, lower(case_number))",
  `create unique index chargebacks_provider on chargebacks (connection_id, provider_dispute_id)
     where provider_dispute_id is not null`,
  "create index chargebacks_deadline on chargebacks (workspace_id, status, deadline_at)",
  "create index chargebacks_order on chargebacks (order_id) where order_id is not null",
  "create index chargebacks_customer on chargebacks (customer_id) where customer_id is not null",
  "create trigger chargebacks_touch before update on chargebacks for each row execute function touch_updated_at()",
  tenantTable("chargebacks", { membersOnly: true }),
  "create policy chargebacks_routing on chargebacks as permissive for select to insyte_owner using (true)",
  `create table evidence_items (
     id            text primary key,
     workspace_id  text not null references workspaces(id) on delete cascade,
     chargeback_id text not null references chargebacks(id) on delete cascade,
     kind          text not null
                     check (kind in ('tracking', 'delivery', 'correspondence', 'invoice', 'refund_policy', 'upload',
                                     'narrative')),
     file_id       text references files(id) on delete set null,
     source        text not null check (source in ('insyte', 'upload')),
     source_ref    text,
     name          text not null check (btrim(name) <> '' and char_length(name) <= 200),
     size_bytes    bigint not null default 0 check (size_bytes >= 0),
     included      boolean not null default true,
     position      double precision not null default 0,
     added_by      text,
     created_at    timestamptz not null default now(),
     removed_at    timestamptz
   )`,
  "create index evidence_items_case on evidence_items (chargeback_id, position) where removed_at is null",
  "create unique index evidence_items_file on evidence_items (chargeback_id, file_id) where removed_at is null",
  tenantTable("evidence_items", { membersOnly: true }),
  `create table chargeback_events (
     id            text primary key,
     workspace_id  text not null references workspaces(id) on delete cascade,
     chargeback_id text not null references chargebacks(id) on delete cascade,
     at            timestamptz not null default now(),
     actor_kind    text not null,
     actor_id      text,
     kind          text not null
                     check (kind in ('opened', 'evidence_added', 'evidence_removed', 'pack_assembled', 'submitted',
                                     'accepted', 'won', 'lost', 'deadline_reminder', 'note')),
     data          jsonb not null default '{}'
   )`,
  "create index chargeback_events_case on chargeback_events (chargeback_id, at)",
  `create unique index chargeback_events_reminder on chargeback_events (chargeback_id, (data ->> 'offset'),
     (data ->> 'deadline')) where kind = 'deadline_reminder'`,
  tenantTable("chargeback_events", { membersOnly: true }),
  // Start's queue: a case that needs evidence is a row of its own.
  "alter table queue_items drop constraint queue_items_kind_check",
  `alter table queue_items add constraint queue_items_kind_check
     check (kind in ('order_delayed', 'return_review', 'quality_review', 'stock_out', 'store_disconnected',
                     'chargeback_deadline'))`,
  // The 15-minute sweep also brings in line a workspace whose only cases were opened by hand, without a store.
  `create or replace function queue_workspaces() returns table (workspace_id text)
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       return query select s.workspace_id from stores s
                    union
                    select c.workspace_id from chargebacks c where c.status in ('open', 'awaiting_evidence');
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  // The hourly reminder sweep's workspaces: those with a case that needs evidence whose deadline is within five days.
  `create function chargeback_deadline_workspaces() returns table (workspace_id text)
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       return query select distinct c.workspace_id from chargebacks c
                    where c.status in ('open', 'awaiting_evidence') and c.deadline_at > now()
                      and c.deadline_at <= now() + interval '5 days';
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function chargeback_deadline_workspaces() from public",
  "grant execute on function chargeback_deadline_workspaces() to insyte_app"
)

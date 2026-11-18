import {
  affiliateProjection,
  newcomerBlind,
  partnerClosed,
  partnerGuard,
  sealedPartition,
  tenantTable
} from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/**
 * The affiliate programme (M16 steps 3–4; domain.md §14, §14.1, §12.10; 06 §5 family A). One programme per workspace
 * with its tiers; people apply (or are invited) and become affiliates with a code; their links point at the store and
 * every click through Insyte's redirect is a row; an order that carries an affiliate's code or link is a conversion;
 * the money is an append-only ledger (accrual, reversal, approval, settlement) and a month's payout is a sum over it.
 *
 * An affiliate is a partner principal of its own (`affiliate`, its row as `app_partner_id()`): it reads its own rows of
 * these tables and nothing of the workspace's others (they are member side or partner-blind already, 0075). Its
 * conversions and clicks are closed to it as tables and read through views that never name the shopper: the order's
 * number and amounts only. It writes only where the portal writes: its links (label, archived), its own profile and
 * payment columns (`partnerGuard`), its own code's history, and its own outbox rows of the kinds the portal sends.
 *
 * The person behind an application is no principal of the workspace yet: applying, applying again and taking up an
 * invitation run through definer functions that answer only the caller's own (`app.user_id`), as the supplier's do.
 * The click redirect runs before any principal at all: `affiliate_click` finds the link by its slug, writes the click
 * and answers the store's own address, nothing else.
 */

/** The member side, or the calling affiliate for its own rows (by a column naming the affiliate). */
const OWN = (column: string) => `${column} = app_partner_id()`

/** Anyone but a partner principal. */
const NOT_PARTNER = "(app_principal_kind() is null or app_principal_kind() not in ('supplier_contact', 'affiliate'))"

export default statements(
  // The programme: one per workspace, made with its defaults when the brand starts it (its first invitation, or saving
  // its settings: `startProgram`); a workspace without one has no apply page and no conversions.
  `create table affiliate_programs (
     workspace_id        text primary key references workspaces(id) on delete cascade,
     commission_model    text not null default 'tiers' check (commission_model in ('tiers')),
     return_days         int not null default 14 check (return_days between 0 and 365),
     payout_day          int not null default 15 check (payout_day between 1 and 28),
     attribution_days    int not null default 30 check (attribution_days between 1 and 365),
     default_tier        text not null default 'bronze' check (default_tier in ('bronze', 'silver', 'gold')),
     discount_percent    int not null default 10 check (discount_percent between 0 and 90),
     currency            text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
     store_id            text references stores(id) on delete set null,
     storefront_base_url text,
     faqs                jsonb not null default '[]',
     reject_reasons      text[] not null default '{}',
     enabled             boolean not null default true,
     apply_slug          text not null unique check (apply_slug ~ '^[a-z0-9]{10,32}$'),
     created_at          timestamptz not null default now(),
     updated_at          timestamptz not null default now()
   )`,
  "create trigger affiliate_programs_touch before update on affiliate_programs for each row execute function touch_updated_at()",
  ...tenantTable("affiliate_programs"),
  newcomerBlind("affiliate_programs"),
  // An affiliate reads its programme (tiers, FAQ, payout day), never changes it.
  ...affiliateProjection("affiliate_programs", "true"),
  `create table affiliate_tiers (
     workspace_id text not null references affiliate_programs(workspace_id) on delete cascade,
     tier         text not null check (tier in ('bronze', 'silver', 'gold')),
     rate         numeric(5, 2) not null check (rate >= 0 and rate <= 100),
     threshold    int not null check (threshold >= 0),
     position     int not null,
     primary key (workspace_id, tier)
   )`,
  ...tenantTable("affiliate_tiers"),
  newcomerBlind("affiliate_tiers"),
  ...affiliateProjection("affiliate_tiers", "true"),
  //
  `create table affiliate_applications (
     id                 text primary key,
     workspace_id       text not null references workspaces(id) on delete cascade,
     user_id            text not null,
     name               text not null check (length(name) between 1 and 200),
     email              text not null check (email = lower(email)),
     business_name      text check (length(business_name) <= 200),
     country            text check (length(country) <= 80),
     channel            text check (length(channel) <= 80),
     audience           text check (length(audience) <= 2000),
     motivation         text check (length(motivation) <= 4000),
     main_url           text check (length(main_url) <= 500),
     payout_method_hint text check (length(payout_method_hint) <= 40),
     status             text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
     reason             text check (length(reason) <= 1000),
     decided_by         text,
     decided_at         timestamptz,
     applied_at         timestamptz not null default now(),
     reapplied_from     text references affiliate_applications(id) on delete set null,
     affiliate_id       text
   )`,
  "create index affiliate_applications_list on affiliate_applications (workspace_id, status, applied_at desc, id desc)",
  // One open application per person per programme.
  `create unique index affiliate_applications_open on affiliate_applications (workspace_id, user_id)
     where status = 'pending'`,
  ...tenantTable("affiliate_applications"),
  newcomerBlind("affiliate_applications"),
  ...affiliateProjection("affiliate_applications", OWN("affiliate_id")),
  //
  `create table affiliates (
     id                     text primary key,
     workspace_id           text not null references workspaces(id) on delete cascade,
     user_id                text not null,
     name                   text not null check (length(name) between 1 and 200),
     email                  text not null check (email = lower(email)),
     code                   text not null check (code ~ '^[A-Z0-9]{3,20}$'),
     tier                   text not null check (tier in ('bronze', 'silver', 'gold')),
     rate                   numeric(5, 2) not null check (rate >= 0 and rate <= 100),
     status                 text not null default 'active' check (status in ('active', 'paused')),
     application_id         text references affiliate_applications(id) on delete set null,
     invitation_id          text,
     approved_by            text,
     approved_at            timestamptz,
     joined_at              timestamptz not null default now(),
     -- The Shopify discount for its code (outbox, after the undo window): asked, made, refused, or no store to make it.
     discount_state         text not null default 'pending' check (discount_state in ('pending', 'made', 'failed', 'off', 'erased')),
     discount_error         text,
     shopify_discount_id    text,
     payment_method         text check (payment_method in ('paypal', 'bank', 'wise')),
     -- The account (an IBAN, an address) is sealed (\`Sealer\`); the hint is what the screens show, never more.
     payment_account_sealed text,
     payment_account_hint   text,
     payment_tax_id         text check (length(payment_tax_id) <= 40),
     payment_updated_at     timestamptz,
     created_at             timestamptz not null default now(),
     updated_at             timestamptz not null default now()
   )`,
  "create trigger affiliates_touch before update on affiliates for each row execute function touch_updated_at()",
  "create unique index affiliates_code on affiliates (workspace_id, code)",
  "create unique index affiliates_person on affiliates (workspace_id, user_id)",
  "create index affiliates_list on affiliates (workspace_id, joined_at desc, id desc)",
  ...tenantTable("affiliates"),
  newcomerBlind("affiliates"),
  ...affiliateProjection("affiliates", OWN("id"), { update: "true" }),
  // Its name, address, code and where its money goes; never its tier, rate, status or who approved it.
  // Its name and how it is paid; never its code, tier, rate, status or its discount (the brand's, PLAN item 22).
  partnerGuard("affiliates", [
    "name",
    "payment_method",
    "payment_account_sealed",
    "payment_account_hint",
    "payment_tax_id",
    "payment_updated_at"
  ]),
  "alter table affiliate_applications add constraint affiliate_applications_affiliate_fk foreign key (affiliate_id) references affiliates(id) on delete set null",
  // Every code an affiliate held: a changed code keeps attributing (and stays taken) until `valid_until`.
  `create table affiliate_codes (
     workspace_id text not null references workspaces(id) on delete cascade,
     code         text not null check (code ~ '^[A-Z0-9]{3,20}$'),
     affiliate_id text not null references affiliates(id) on delete cascade,
     created_at   timestamptz not null default now(),
     valid_until  timestamptz,
     primary key (workspace_id, code)
   )`,
  "create index affiliate_codes_affiliate on affiliate_codes (affiliate_id)",
  ...tenantTable("affiliate_codes"),
  newcomerBlind("affiliate_codes"),
  // Read only for the affiliate: a code is what attributes an order, so only the brand makes or ends one.
  ...affiliateProjection("affiliate_codes", OWN("affiliate_id")),
  //
  `create table affiliate_links (
     id               text primary key,
     workspace_id     text not null references workspaces(id) on delete cascade,
     affiliate_id     text not null references affiliates(id) on delete cascade,
     label            text not null check (length(label) between 1 and 80),
     destination_id   text not null check (length(destination_id) <= 120),
     destination_path text not null check (destination_path ~ '^/[A-Za-z0-9/_.~%-]*$' and length(destination_path) <= 300),
     medium           text not null check (medium in ('social', 'video', 'email', 'blog', 'print')),
     campaign_slug    text not null check (campaign_slug ~ '^[a-z0-9-]{1,60}$'),
     url              text not null,
     -- The redirect's key, the same across workspaces: \`/r/<short_slug>\`.
     short_slug       text not null unique check (short_slug ~ '^[a-z0-9]{8,16}$'),
     created_at       timestamptz not null default now(),
     archived_at      timestamptz
   )`,
  "create index affiliate_links_list on affiliate_links (workspace_id, affiliate_id, created_at desc, id desc)",
  ...tenantTable("affiliate_links"),
  newcomerBlind("affiliate_links"),
  ...affiliateProjection("affiliate_links", OWN("affiliate_id"), { insert: "true", update: "true" }),
  partnerGuard("affiliate_links", ["label", "archived_at"]),
  // Clicks through the redirect, by month (domain.md §18.2: 13 months online). The address and the browser only as
  // daily salted hashes, never as they came.
  `create table affiliate_clicks (
     id           text not null,
     workspace_id text not null references workspaces(id) on delete cascade,
     link_id      text not null,
     affiliate_id text not null,
     at           timestamptz not null default now(),
     ip_hash      bytea,
     ua_hash      bytea,
     country      text check (length(country) <= 2),
     landing_path text check (length(landing_path) <= 300),
     primary key (id, at)
   ) partition by range (at)`,
  "create table affiliate_clicks_default partition of affiliate_clicks default",
  ...sealedPartition("affiliate_clicks_default"),
  "create index affiliate_clicks_link on affiliate_clicks (workspace_id, link_id, at)",
  "create index affiliate_clicks_affiliate on affiliate_clicks (workspace_id, affiliate_id, at)",
  ...tenantTable("affiliate_clicks"),
  newcomerBlind("affiliate_clicks"),
  partnerClosed("affiliate_clicks"),
  // An address as one person's: lower case, without a \`+tag\`, and Gmail's without its dots (\`a.b+x@googlemail.com\` is
  // \`ab@gmail.com\`). What the self-referral check compares (M16 step 4).
  `create function affiliate_email_key(email text) returns text language sql immutable parallel safe as $$
     select case when email is null or position('@' in email) = 0 then lower(email)
            else (select case when d in ('gmail.com', 'googlemail.com')
                              then replace(split_part(l, '+', 1), '.', '') || '@gmail.com'
                              else split_part(l, '+', 1) || '@' || d end
                  from (select lower(split_part(email, '@', 1)) as l, lower(split_part(email, '@', 2)) as d) parts)
            end
   $$`,
  // An order that came through an affiliate: one per order, the commission at the rate of its moment. The order may go
  // (Shopify's \`shop/redact\`, a shopper erased): the conversion and its ledger stay, with its number and amounts.
  `create table affiliate_conversions (
     id               text primary key,
     workspace_id     text not null references workspaces(id) on delete cascade,
     affiliate_id     text not null references affiliates(id) on delete cascade,
     link_id          text references affiliate_links(id) on delete set null,
     order_id         text references orders(id) on delete set null,
     -- The order's store, for the team's store fence (an affiliate sees every store's of its own).
     store_id         text,
     order_number     text not null,
     product_title    text not null default '',
     attributed_by    text not null check (attributed_by in ('link', 'code')),
     code             text,
     base_minor       bigint not null check (base_minor >= 0),
     commission_minor bigint not null check (commission_minor >= 0),
     rate             numeric(5, 2) not null,
     currency         text not null,
     -- \`flagged\`: the order looks like the affiliate's own (its address or its Shopify customer); no accrual until the
     -- brand accepts it (then \`pending\`) or turns it down (then \`reversed\`, \`self\`).
     status           text not null default 'pending'
                      check (status in ('pending', 'approved', 'paid', 'reversed', 'flagged')),
     flag_reason      text check (flag_reason in ('self')),
     placed_at        timestamptz not null,
     month            text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
     delivered_at     timestamptz,
     window_ends_at   timestamptz,
     approved_at      timestamptz,
     reversed_at      timestamptz,
     reversal_reason  text check (reversal_reason in ('refund', 'cancel', 'self')),
     payout_id        text,
     created_at       timestamptz not null default now()
   )`,
  "create unique index affiliate_conversions_order on affiliate_conversions (order_id)",
  "create index affiliate_conversions_list on affiliate_conversions (workspace_id, affiliate_id, placed_at desc, id desc)",
  "create index affiliate_conversions_due on affiliate_conversions (workspace_id, window_ends_at) where status = 'pending'",
  "create index affiliate_conversions_payout on affiliate_conversions (payout_id) where payout_id is not null",
  ...tenantTable("affiliate_conversions"),
  newcomerBlind("affiliate_conversions"),
  partnerClosed("affiliate_conversions"),
  // The money, append-only (domain.md §14.1): never updated, never deleted by the app.
  `create table affiliate_ledger_entries (
     id            text primary key,
     workspace_id  text not null references workspaces(id) on delete cascade,
     affiliate_id  text not null references affiliates(id) on delete cascade,
     -- No cascade: a conversion with money on it is never deleted from under its lines (the workspace's purge aside).
     conversion_id text references affiliate_conversions(id),
     payout_id     text,
     kind          text not null check (kind in ('accrual', 'reversal', 'approval', 'settlement')),
     amount_minor  bigint not null,
     currency      text not null,
     month         text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
     at            timestamptz not null default now(),
     actor         text,
     check ((kind = 'accrual' and amount_minor >= 0 and conversion_id is not null)
            or (kind = 'reversal' and amount_minor <= 0 and conversion_id is not null)
            or (kind = 'approval' and amount_minor = 0 and payout_id is not null)
            or (kind = 'settlement' and amount_minor <= 0 and payout_id is not null))
   )`,
  // One accrual per conversion; one approval marker and one settlement per payout.
  "create unique index affiliate_ledger_accrual on affiliate_ledger_entries (conversion_id) where kind = 'accrual'",
  `create unique index affiliate_ledger_payout_kind on affiliate_ledger_entries (payout_id, kind)
     where payout_id is not null`,
  "create index affiliate_ledger_affiliate on affiliate_ledger_entries (workspace_id, affiliate_id, at)",
  "create index affiliate_ledger_conversion on affiliate_ledger_entries (conversion_id) where conversion_id is not null",
  "create index affiliate_ledger_payout on affiliate_ledger_entries (payout_id) where payout_id is not null",
  ...tenantTable("affiliate_ledger_entries"),
  newcomerBlind("affiliate_ledger_entries"),
  ...affiliateProjection("affiliate_ledger_entries", OWN("affiliate_id")),
  "revoke update, delete on affiliate_ledger_entries from insyte_app",
  // For every role, cascades included (they run as the table's owner): the one way out is the workspace's own purge
  // (\`purge_workspace\`, 0076), where the workspace is gone already, as \`members_one_owner\` reads it (0009).
  `create function affiliate_ledger_frozen() returns trigger language plpgsql set search_path = public, pg_temp as $$
     begin
       if tg_op = 'DELETE' then
         if not workspace_exists(old.workspace_id) then return old; end if;
       end if;
       raise exception 'the affiliate ledger is append-only' using errcode = '42501';
     end $$`,
  `create trigger affiliate_ledger_frozen before update or delete on affiliate_ledger_entries for each row
     execute function affiliate_ledger_frozen()`,
  // Emptying the table wholesale skips the row trigger and has no row to tell the purge by: refused as well.
  `create trigger affiliate_ledger_untruncated before truncate on affiliate_ledger_entries for each statement
     execute function affiliate_ledger_frozen()`,
  // One payout per affiliate and month closed (the running month has none: it "loopt nog").
  `create table affiliate_payouts (
     id              text primary key,
     workspace_id    text not null references workspaces(id) on delete cascade,
     affiliate_id    text not null references affiliates(id) on delete cascade,
     month           text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
     conversions     int not null default 0,
     gross_minor     bigint not null default 0,
     reversed_minor  bigint not null default 0,
     total_minor     bigint not null default 0,
     approvable_minor bigint not null default 0,
     in_window_minor bigint not null default 0,
     currency        text not null,
     status          text not null default 'approvable' check (status in ('approvable', 'approved', 'paid')),
     pay_day         date not null,
     approved_by     text,
     approved_at     timestamptz,
     method_snapshot text,
     paid_by         text,
     paid_at         timestamptz,
     paid_minor      bigint,
     reference       text check (length(reference) <= 200),
     closed_at       timestamptz not null default now(),
     unique (affiliate_id, month)
   )`,
  "create index affiliate_payouts_month on affiliate_payouts (workspace_id, month, affiliate_id)",
  ...tenantTable("affiliate_payouts"),
  newcomerBlind("affiliate_payouts"),
  ...affiliateProjection("affiliate_payouts", OWN("affiliate_id")),
  `alter table affiliate_conversions add constraint affiliate_conversions_payout_fk foreign key (payout_id)
     references affiliate_payouts(id) on delete set null`,
  `alter table affiliate_ledger_entries add constraint affiliate_ledger_payout_fk foreign key (payout_id)
     references affiliate_payouts(id)`,
  // What the brand shares with its affiliates: a file in the bucket and its title.
  `create table affiliate_resources (
     id           text primary key,
     workspace_id text not null references workspaces(id) on delete cascade,
     kind         text not null check (kind in ('logo', 'image', 'video', 'doc', 'guide')),
     title        text not null check (length(title) between 1 and 120),
     file_id      text not null,
     -- The bucket's key and the name it downloads as: an affiliate reads no \`files\` row.
     r2_key       text not null,
     file_name    text not null,
     mime         text not null,
     size_bytes   bigint not null,
     published_by text,
     created_at   timestamptz not null default now(),
     updated_at   timestamptz not null default now(),
     archived_at  timestamptz
   )`,
  "create index affiliate_resources_list on affiliate_resources (workspace_id, updated_at desc, id desc)",
  ...tenantTable("affiliate_resources"),
  newcomerBlind("affiliate_resources"),
  ...affiliateProjection("affiliate_resources", "archived_at is null"),
  // The order's link from the storefront: the cart attribute `insyte_ref` (the redirect's, carried by the store).
  "alter table orders add column affiliate_ref text check (length(affiliate_ref) <= 64)",
  // An affiliate's outbox rows: only its own, and only what the portal sends: the realtime frame of its own profile
  // (\`affiliate\`, itself) or of one of its own links (\`affiliate_link\`), one id each, in its own workspace.
  `alter policy outbox_partner_write on outbox
     with check (${NOT_PARTNER} or (
       app_principal_kind() = 'supplier_contact' and app_partner_id() is not null
       and created_by_principal = app_principal_id() and (
         event = 'records.changed'
         or (event = 'partner.changed' and payload ->> 'supplierId' = app_partner_id())
         or (event = 'supplier.problem_reported' and payload ->> 'supplierId' = app_partner_id()
             and payload ->> 'contactId' = app_principal_id())
         or (event = 'order.updated' and payload ->> 'change' = 'fulfil'
             and payload ->> 'supplierId' = app_partner_id()
             and payload ->> 'userId' = 'supplier_contact:' || app_principal_id())))
     or (
       app_principal_kind() = 'affiliate' and app_partner_id() is not null
       and created_by_principal = app_principal_id() and app_principal_id() = app_partner_id() and (
         event = 'records.changed' and payload ->> 'workspaceId' = workspace_id
         and not (payload ? 'affiliateIds') and jsonb_typeof(payload -> 'ids') = 'array'
         and jsonb_array_length(payload -> 'ids') = 1
         and ((payload ->> 'kind' = 'affiliate' and payload -> 'ids' ->> 0 = app_partner_id())
              or (payload ->> 'kind' = 'affiliate_link'
                  and exists (select 1 from affiliate_links l where l.id = payload -> 'ids' ->> 0
                                and l.affiliate_id = app_partner_id()))))))`,
  // A partner changes its own frames only to cancel them (its undo): an update may not turn an allowed frame into
  // another (\`outbox_partner_change\`, 0075, checks no more than whose it is), for a supplier contact as for an affiliate.
  `create function outbox_partner_cancel_only() returns trigger language plpgsql set search_path = public, pg_temp as $$
     begin
       if app_principal_kind() in ('supplier_contact', 'affiliate')
          and (new.cancelled_at is null or to_jsonb(new) - 'cancelled_at' is distinct from to_jsonb(old) - 'cancelled_at')
       then
         raise exception 'a partner may only cancel its own outbox frames' using errcode = '42501';
       end if;
       return new;
     end $$`,
  `create trigger outbox_partner_cancel_only before update on outbox for each row
     execute function outbox_partner_cancel_only()`,
  // The views the affiliate reads (06 §6): its own, never the shopper. Each runs as its owner (no superuser, no
  // BYPASSRLS, so the tenant policies still hold) because the tables are closed to partners, and each filters to the
  // calling affiliate itself, so a member reads nothing here.
  `create view affiliate_conversions_v with (security_invoker = false) as
     select c.id, c.workspace_id, c.affiliate_id, c.link_id, l.label as link_label, c.order_number, c.product_title,
            c.attributed_by, c.base_minor, c.commission_minor, c.rate, c.currency,
            case when c.status = 'flagged' then 'pending' else c.status end as status, c.placed_at, c.month,
            c.window_ends_at, c.reversed_at, c.payout_id
     from affiliate_conversions c left join affiliate_links l on l.id = c.link_id
     where app_principal_kind() = 'affiliate' and c.affiliate_id = app_partner_id()
       and c.workspace_id = app_workspace_id()`,
  `create view affiliate_clicks_v with (security_invoker = false) as
     select k.workspace_id, k.affiliate_id, k.link_id, date_trunc('day', k.at) as day, count(*)::int as clicks
     from affiliate_clicks k
     where app_principal_kind() = 'affiliate' and k.affiliate_id = app_partner_id()
       and k.workspace_id = app_workspace_id()
     group by k.workspace_id, k.affiliate_id, k.link_id, date_trunc('day', k.at)`,
  // Where a link may land: the store's active products by their handle (titles only, never a price).
  // `products` is the supplier's projection, so this reads it as the system, for the calling affiliate only.
  `create function affiliate_destinations() returns table (id text, workspace_id text, title text, path text)
     language plpgsql security definer set search_path = public, pg_temp as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       if prior is distinct from 'affiliate' or app_partner_id() is null then return; end if;
       if not exists (select 1 from affiliates a where a.id = app_partner_id() and a.workspace_id = app_workspace_id())
       then return; end if;
       perform set_config('app.principal_kind', 'system', true);
       return query select p.id, p.workspace_id, p.title, '/products/' || p.handle
                    from products p
                    where p.workspace_id = app_workspace_id() and p.status = 'active'
                      and p.handle ~ '^[A-Za-z0-9_-]{1,200}$'
                    order by p.title limit 50;
       perform set_config('app.principal_kind', prior, true);
     end $$`,
  // The store's own address the calling affiliate's links land on: the programme's, else its store's.
  `create function affiliate_storefront() returns text
     language plpgsql security definer set search_path = public, pg_temp as $$
     declare prior text := current_setting('app.principal_kind', true);
             base text;
     begin
       if prior is distinct from 'affiliate' or app_partner_id() is null then return null; end if;
       perform set_config('app.principal_kind', 'system', true);
       select coalesce(p.storefront_base_url,
                       (select 'https://' || s.shop_domain from stores s
                        where s.workspace_id = p.workspace_id and s.status <> 'disconnected'
                          and (p.store_id is null or s.id = p.store_id)
                        order by s.created_at limit 1))
         into base
       from affiliate_programs p
       where p.workspace_id = app_workspace_id()
         and exists (select 1 from affiliates a where a.id = app_partner_id() and a.workspace_id = p.workspace_id);
       perform set_config('app.principal_kind', prior, true);
       return base;
     end $$`,
  "revoke all on function affiliate_storefront() from public",
  "grant execute on function affiliate_storefront() to insyte_app",
  "revoke all on function affiliate_destinations() from public",
  "grant execute on function affiliate_destinations() to insyte_app",
  "create view affiliate_destinations_v as select * from affiliate_destinations()",
  "revoke all on affiliate_conversions_v, affiliate_clicks_v, affiliate_destinations_v from public",
  "grant select on affiliate_conversions_v, affiliate_clicks_v, affiliate_destinations_v to insyte_app",
  // Routing: the definers below find a link by its slug and a programme by its apply slug across workspaces.
  "create policy affiliate_links_routing on affiliate_links as permissive for select to insyte_owner using (true)",
  "create policy affiliate_programs_routing on affiliate_programs as permissive for select to insyte_owner using (true)",
  "create policy affiliates_routing on affiliates as permissive for select to insyte_owner using (true)",
  `create policy affiliate_applications_routing on affiliate_applications as permissive for select to insyte_owner
     using (true)`,
  // The signed-in person's affiliates across workspaces, newest first, for the session (`principalFrom`).
  `create function affiliate_principals() returns table (affiliate_id text, workspace_id text, workspace_name text,
                                                         name text, email text, code text, tier text, rate numeric,
                                                         status text, joined_at timestamptz)
     language plpgsql security definer set search_path = public, pg_temp as $$
     declare prior text := current_setting('app.principal_kind', true);
             who text := nullif(current_setting('app.user_id', true), '');
     begin
       if who is null then return; end if;
       perform set_config('app.principal_kind', 'system', true);
       return query
         select a.id, a.workspace_id, w.name, a.name, a.email, a.code, a.tier, a.rate, a.status, a.joined_at
         from affiliates a join workspaces w on w.id = a.workspace_id
         where a.user_id = who and w.deleted_at is null
         order by a.joined_at desc;
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  // The person's newest application per programme they are no affiliate of: the portal's gate (pending, rejected).
  `create function affiliate_applications_mine() returns table (application_id text, workspace_id text,
                                                                workspace_name text, status text, reason text,
                                                                applied_at timestamptz, decided_at timestamptz,
                                                                name text)
     language plpgsql security definer set search_path = public, pg_temp as $$
     declare prior text := current_setting('app.principal_kind', true);
             who text := nullif(current_setting('app.user_id', true), '');
     begin
       if who is null then return; end if;
       perform set_config('app.principal_kind', 'system', true);
       return query
         select distinct on (a.workspace_id) a.id, a.workspace_id, w.name, a.status, a.reason, a.applied_at,
                a.decided_at, a.name
         from affiliate_applications a join workspaces w on w.id = a.workspace_id
         where a.user_id = who and w.deleted_at is null
           and not exists (select 1 from affiliates f where f.workspace_id = a.workspace_id and f.user_id = who)
         order by a.workspace_id, a.applied_at desc;
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  // A programme's public application page: the brand's name only, and whether it takes applications.
  `create function affiliate_program_landing(p_slug text) returns table (workspace_id text, workspace_name text,
                                                                        enabled boolean)
     language plpgsql security definer set search_path = public, pg_temp as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       return query
         select p.workspace_id, w.name, p.enabled from affiliate_programs p join workspaces w on w.id = p.workspace_id
         where p.apply_slug = p_slug and w.deleted_at is null;
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  // Applying, as the signed-in person, to a programme by its slug; or applying again after a rejection (`p_from`, the
  // rejected application, whose answers stand where no new one is given). Answers the application, or a reason:
  // 'closed' (no such programme, or it takes none), 'member' (already an affiliate), 'open' (an application waits),
  // 'not_rejected' (a reapply of one that is not the person's rejected one). The team hears of it through the outbox
  // (`affiliate.applied`).
  `create function affiliate_apply(p_slug text, p_id text, p_outbox text, p_from text, p_name text,
                                   p_business text, p_country text, p_channel text, p_audience text,
                                   p_motivation text, p_url text, p_payout text)
     returns table (application_id text, workspace_id text, refusal text)
     language plpgsql security definer set search_path = public, pg_temp as $$
     declare prior text := current_setting('app.principal_kind', true);
             prior_ws text := current_setting('app.workspace_id', true);
             who text := nullif(current_setting('app.user_id', true), '');
             ws text;
             old affiliate_applications%rowtype;
             mail text;
             refused text;
     begin
       if who is null then return; end if;
       perform set_config('app.principal_kind', 'system', true);
       if p_from is not null then
         select a.* into old from affiliate_applications a where a.id = p_from and a.user_id = who
           and a.status = 'rejected';
         ws := old.workspace_id;
         if ws is null then refused := 'not_rejected'; end if;
         if refused is null and not exists (select 1 from affiliate_programs p join workspaces w on w.id = p.workspace_id
                                            where p.workspace_id = ws and p.enabled and w.deleted_at is null) then
           refused := 'closed';
         end if;
       else
         select p.workspace_id into ws from affiliate_programs p join workspaces w on w.id = p.workspace_id
         where p.apply_slug = p_slug and p.enabled and w.deleted_at is null;
         if ws is null then refused := 'closed'; end if;
       end if;
       if refused is null then
         perform set_config('app.workspace_id', ws, true);
         perform pg_advisory_xact_lock(hashtext('affiliate_apply:' || ws || ':' || who));
         if exists (select 1 from affiliates f where f.workspace_id = ws and f.user_id = who) then
           refused := 'member';
         elsif exists (select 1 from affiliate_applications a where a.workspace_id = ws and a.user_id = who
                         and a.status = 'pending') then
           refused := 'open';
         end if;
       end if;
       if refused is not null then
         perform set_config('app.principal_kind', coalesce(prior, ''), true);
         perform set_config('app.workspace_id', coalesce(prior_ws, ''), true);
         return query select null::text, ws, refused; return;
       end if;
       select lower(u.email) into mail from auth."user" u where u.id = who;
       insert into affiliate_applications (id, workspace_id, user_id, name, email, business_name, country, channel,
                                           audience, motivation, main_url, payout_method_hint, reapplied_from)
       values (p_id, ws, who, coalesce(nullif(p_name, ''), old.name), mail,
               coalesce(nullif(p_business, ''), old.business_name), coalesce(nullif(p_country, ''), old.country),
               coalesce(nullif(p_channel, ''), old.channel), coalesce(nullif(p_audience, ''), old.audience),
               coalesce(nullif(p_motivation, ''), old.motivation), coalesce(nullif(p_url, ''), old.main_url),
               coalesce(nullif(p_payout, ''), old.payout_method_hint), p_from);
       insert into outbox (id, workspace_id, event, payload)
       values (p_outbox, ws, 'affiliate.applied',
               jsonb_build_object('workspaceId', ws, 'applicationId', p_id, 'reapplied', p_from is not null));
       insert into audit_events (id, workspace_id, actor_kind, actor_id, action, subject_type, subject_id, diff)
       values ('aud_' || p_id, ws, 'system', who, 'affiliate.applied', 'affiliate_application', p_id,
               jsonb_build_object('reapplied', p_from is not null));
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
       perform set_config('app.workspace_id', coalesce(prior_ws, ''), true);
       return query select p_id, ws, null::text;
     end $$`,
  // Taking up an affiliate invitation, as the signed-in person inside its workspace (`Db.asNewcomerIn`): an open
  // invitation of the person's own address, by its secret (the link's, hashed). The affiliate starts on the
  // invitation's tier with the code given (unique, or a number appended), and its Shopify discount is asked for.
  // Answers the affiliate, or null when there is nothing to take up.
  `create function affiliate_join(p_invitation text, p_token_hash bytea, p_id text, p_code text, p_outbox text)
     returns text
     language plpgsql security definer set search_path = public, pg_temp as $$
     declare prior text := current_setting('app.principal_kind', true);
             who text := nullif(current_setting('app.user_id', true), '');
             ws text := nullif(current_setting('app.workspace_id', true), '');
             inv invitations%rowtype;
             result text;
             wanted text;
             n int := 1;
             tier_rate numeric;
             person text;
     begin
       if who is null or ws is null or p_token_hash is null then return null; end if;
       perform set_config('app.principal_kind', 'system', true);
       select i.* into inv from invitations i
       where i.id = p_invitation and i.workspace_id = ws and i.kind = 'affiliate' and i.token_hash = p_token_hash
         and i.accepted_at is null and i.revoked_at is null and i.declined_at is null and i.expires_at > now()
         and i.email = (select lower(u.email) from auth."user" u where u.id = who)
       for update;
       if not found then
         perform set_config('app.principal_kind', coalesce(prior, ''), true);
         return null;
       end if;
       select a.id into result from affiliates a where a.workspace_id = ws and a.user_id = who;
       if result is null then
         select t.rate into tier_rate from affiliate_tiers t
         where t.workspace_id = ws and t.tier = coalesce(inv.affiliate_tier, 'bronze');
         wanted := p_code;
         while exists (select 1 from affiliate_codes c where c.workspace_id = ws and c.code = wanted) loop
           n := n + 1;
           wanted := left(p_code, 18) || n::text;
         end loop;
         select coalesce(inv.name, u.name, inv.email) into person from auth."user" u where u.id = who;
         result := p_id;
         insert into affiliates (id, workspace_id, user_id, name, email, code, tier, rate, invitation_id,
                                 approved_by, approved_at)
         values (result, ws, who, coalesce(person, inv.email), inv.email, wanted, coalesce(inv.affiliate_tier, 'bronze'),
                 coalesce(tier_rate, 10), inv.id, inv.invited_by, now());
         insert into affiliate_codes (workspace_id, code, affiliate_id) values (ws, wanted, result);
         insert into outbox (id, workspace_id, event, payload)
         values (p_outbox, ws, 'affiliate.discount_requested',
                 jsonb_build_object('workspaceId', ws, 'affiliateIds', jsonb_build_array(result)));
       end if;
       update invitations set accepted_at = now(), accepted_by_user = who where id = inv.id;
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
       return result;
     end $$`,
  // The click redirect (M16 step 4), before any principal: the link by its slug, the click written in its workspace,
  // and what the redirect needs: the store's own address and the path (never an address the request named).
  `create function affiliate_click(p_slug text, p_id text, p_ip_hash bytea, p_ua_hash bytea, p_country text)
     returns table (base_url text, path text, campaign text, medium text, slug text)
     language plpgsql security definer set search_path = public, pg_temp as $$
     declare prior text := current_setting('app.principal_kind', true);
             prior_ws text := current_setting('app.workspace_id', true);
             l affiliate_links%rowtype;
             base text;
     begin
       perform set_config('app.principal_kind', 'system', true);
       select k.* into l from affiliate_links k
       where k.short_slug = p_slug and k.archived_at is null
         and exists (select 1 from affiliates a where a.id = k.affiliate_id and a.status = 'active');
       if found then
         perform set_config('app.workspace_id', l.workspace_id, true);
         select coalesce(p.storefront_base_url,
                         (select 'https://' || s.shop_domain from stores s
                          where s.workspace_id = l.workspace_id and s.status <> 'disconnected'
                            and (p.store_id is null or s.id = p.store_id)
                          order by s.created_at limit 1))
           into base
         from affiliate_programs p where p.workspace_id = l.workspace_id and p.enabled;
         if base is not null then
           insert into affiliate_clicks (id, workspace_id, link_id, affiliate_id, ip_hash, ua_hash, country,
                                         landing_path)
           values (p_id, l.workspace_id, l.id, l.affiliate_id, p_ip_hash, p_ua_hash, left(p_country, 2),
                   l.destination_path);
         end if;
       end if;
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
       perform set_config('app.workspace_id', coalesce(prior_ws, ''), true);
       if base is null then return; end if;
       return query select base, l.destination_path, l.campaign_slug, l.medium, l.short_slug;
     end $$`,
  // The close's and the daily approval's workspaces: those with a programme. Ids only.
  `create function affiliate_workspaces() returns table (workspace_id text)
     language plpgsql security definer set search_path = public, pg_temp as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       return query select p.workspace_id from affiliate_programs p join workspaces w on w.id = p.workspace_id
                    where w.deleted_at is null;
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function affiliate_workspaces() from public",
  "grant execute on function affiliate_workspaces() to insyte_app",
  `revoke all on function affiliate_principals(), affiliate_applications_mine(), affiliate_program_landing(text),
     affiliate_apply(text, text, text, text, text, text, text, text, text, text, text, text),
     affiliate_join(text, bytea, text, text, text), affiliate_click(text, text, bytea, bytea, text) from public`,
  `grant execute on function affiliate_principals(), affiliate_applications_mine(), affiliate_program_landing(text),
     affiliate_apply(text, text, text, text, text, text, text, text, text, text, text, text),
     affiliate_join(text, bytea, text, text, text), affiliate_click(text, text, bytea, bytea, text) to insyte_app`
)

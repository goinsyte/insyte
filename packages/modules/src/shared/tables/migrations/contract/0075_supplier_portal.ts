import { partnerBlind, partnerClosed, partnerGuard, supplierProjection } from "@insyte/database/Tenancy"
import { statements } from "../../statements.ts"

/**
 * The supplier portal (M16 steps 1–2; domain.md §18.1, 06 §5–§6). A supplier contact is a principal of its own: one
 * workspace, one supplier. The members-only tables it works on open to it through one restrictive policy each, for its
 * own supplier's rows only (`app_partner_id()`), and the use cases read them through column-hiding views that show no
 * customer email or phone, no totals or shelf prices, no other supplier's lines and never the internal note (only
 * `orders.supplier_note`). The workspace's own tables (the team, its roles, its stores, its settings) shut partner
 * principals out entirely; the workspace row itself is read through `partner_workspace_v`.
 *
 * A partner reads its projection and writes only where the portal writes: its work and its leg (their state columns), its
 * products' lead time and stock reporting, and its own stock counts (`source = 'supplier'`). Nothing it writes can widen
 * what it reads (`partnerGuard`). Its outbox rows are its own, and only of the kinds the portal sends.
 *
 * A contract migration because it replaces the members-only policies of the tables it opens.
 */

/** Anyone but a partner principal (a supplier contact, an affiliate). */
const NOT_PARTNER = "(app_principal_kind() is null or app_principal_kind() not in ('supplier_contact', 'affiliate'))"

/** A line is the supplier's when its leg carries it and reached the supplier (a work row exists). */
const OWN_LINE = (lines: string) =>
  `exists (
  select 1 from forwarding_items f join supplier_work w on w.order_id = f.order_id and w.supplier_id = f.supplier_id
  where f.supplier_id = app_partner_id() and f.order_id = ${lines}.order_id and ${lines}.id = any(f.line_ids)
    and f.state <> 'cancelled')`

/** A product is the supplier's when it supplies it. */
const OWN_PRODUCT = (column: string) =>
  `exists (select 1 from product_supply ps where ps.product_id = ${column} and ps.supplier_id = app_partner_id())`

export default statements(
  // The parcel the supplier handed over (one per order and supplier), who did what, and how it reports its stock.
  `alter table supplier_work
     add column carrier             text,
     add column tracking_number     text,
     add column tracking_url        text,
     add column shipped_by          text,
     add column problem_reported_by text,
     add column problem_ticket_id   text`,
  `alter table product_supply add column stock_reporting text not null default 'manual'
     check (stock_reporting in ('live', 'in_or_out', 'manual'))`,
  "create index supplier_contacts_principal on supplier_contacts (user_id) where revoked_at is null",
  // One owner per supplier at a time (the first to join, `supplier_contact_join`).
  `create unique index supplier_contacts_owner on supplier_contacts (supplier_id)
     where role = 'owner' and revoked_at is null`,
  // A supplier's invitation goes with the supplier.
  `alter table invitations add constraint invitations_supplier_fk foreign key (supplier_id) references suppliers (id)
     on delete cascade`,
  // What a partner may change on a row it may update: the columns the trigger names, nothing else (`partnerGuard`).
  `create function partner_update_guard() returns trigger language plpgsql set search_path = public, pg_temp as $$
     declare k text;
             before jsonb := to_jsonb(old);
             after jsonb := to_jsonb(new);
     begin
       if app_principal_kind() in ('supplier_contact', 'affiliate') then
         for k in select jsonb_object_keys(after) loop
           if not (k = any(tg_argv)) and (before -> k) is distinct from (after -> k) then
             raise exception 'a partner may not change %.%', tg_table_name, k using errcode = '42501';
           end if;
         end loop;
       end if;
       return new;
     end $$`,
  // Whether a variant or a quality check is the calling supplier's, read as the owner: `variants` and
  // `quality_checks` are closed to partners (below), so a policy cannot ask them directly.
  `create function supplier_variant_own(p_variant text) returns boolean
     language sql stable security definer set search_path = public, pg_temp as $$
       select exists (select 1 from variants v join product_supply ps on ps.product_id = v.product_id
                      where v.id = p_variant and ps.supplier_id = app_partner_id()) $$`,
  `create function supplier_check_own(p_check text) returns boolean
     language sql stable security definer set search_path = public, pg_temp as $$
       select exists (select 1 from quality_checks q where q.id = p_check and q.supplier_id = app_partner_id()) $$`,
  "revoke all on function supplier_variant_own(text), supplier_check_own(text) from public",
  "grant execute on function supplier_variant_own(text), supplier_check_own(text) to insyte_app",
  // Family S: the supplier projection.
  supplierProjection("suppliers", "id = app_partner_id()"),
  supplierProjection("supplier_contacts", "id = app_principal_id() and supplier_id = app_partner_id()"),
  // Accepting, shipping, a problem, and their undo: the work's state, never whose it is or which order.
  supplierProjection("supplier_work", "supplier_id = app_partner_id()", { update: "true" }),
  partnerGuard("supplier_work", [
    "status",
    "accepted_at",
    "accepted_by",
    "handoff_by",
    "problem_kind",
    "problem_note",
    "problem_new_date",
    "problem_reported_at",
    "problem_resolved_at",
    "problem_reported_by",
    "shipped_at",
    "shipped_by",
    "carrier",
    "tracking_number",
    "tracking_url"
  ]),
  // The leg confirmed or in error, and its undo; never its lines.
  supplierProjection("forwarding_items", "supplier_id = app_partner_id()", { update: "true" }),
  partnerGuard("forwarding_items", ["state", "since", "confirmed_at", "confirmed_by", "error_kind", "error_note"]),
  supplierProjection("product_supply", "supplier_id = app_partner_id()", { update: "true" }),
  partnerGuard("product_supply", ["lead_days", "stock_reporting"]),
  supplierProjection("supplier_integrations", "supplier_id = app_partner_id()"),
  supplierProjection(
    "orders",
    "exists (select 1 from supplier_work w where w.order_id = orders.id and w.supplier_id = app_partner_id())"
  ),
  supplierProjection("order_lines", OWN_LINE("order_lines")),
  // …but never read directly: the customer's address book, the internal note and the money are on these rows. The
  // supplier views read them as their owner (below), so the projection above holds only those reads.
  partnerClosed("orders"),
  partnerClosed("order_lines"),
  // Shelf prices and the store's raw product data are on these: read through `supplier_products_v` and
  // `supplier_variants_v`.
  supplierProjection("products", OWN_PRODUCT("products.id")),
  supplierProjection("variants", OWN_PRODUCT("variants.product_id")),
  partnerClosed("products"),
  partnerClosed("variants"),
  // The brand's forwarding settings for the supplier are on its row: read through `supplier_self_v`.
  partnerClosed("suppliers"),
  // The store's counts are read; the supplier writes only its own report, at its own location.
  supplierProjection("inventory_levels", "supplier_variant_own(inventory_levels.variant_id)", {
    insert: "source = 'supplier' and location_id = 'supplier'",
    update: "source = 'supplier' and location_id = 'supplier'",
    remove: "source = 'supplier' and location_id = 'supplier'"
  }),
  partnerGuard("inventory_levels", ["available", "reported_by", "reported_at"]),
  supplierProjection("supplier_statements", "supplier_id = app_partner_id()"),
  supplierProjection("supplier_statement_lines", "supplier_id = app_partner_id()"),
  // Quality checks were the workspace's alone (the supplier answered through a signed link, as `system`).
  // Read through `supplier_checks_v`; submitting from the portal comes later.
  supplierProjection("quality_checks", "supplier_id = app_partner_id()", { replaces: false }),
  partnerClosed("quality_checks"),
  supplierProjection("quality_check_media", "supplier_check_own(quality_check_media.check_id)", { replaces: false }),
  supplierProjection(
    "files",
    "uploaded_by = app_principal_id() or (owner_type = 'quality_check' and supplier_check_own(files.owner_id))",
    { replaces: false }
  ),
  // An undo token is its principal's; the member side keeps reading them as before.
  `create policy undo_tokens_own on undo_tokens as restrictive for all
     using (app_is_member_side() or principal_id = app_principal_id())`,
  // The audit log stays the members': a partner writes its own lines and reads none.
  "drop policy audit_events_members on audit_events",
  "create policy audit_events_read on audit_events as restrictive for select using (app_is_member_side())",
  "create policy audit_events_change on audit_events as restrictive for update using (app_is_member_side())",
  "create policy audit_events_remove on audit_events as restrictive for delete using (app_is_member_side())",
  `create policy audit_events_write on audit_events as restrictive for insert
     with check (app_is_member_side() or (actor_kind = app_principal_kind() and actor_id = app_principal_id()))`,
  // The outbox: a partner reads and cancels (its undo) only what it wrote, and writes only what the portal sends, for
  // its own supplier. The relay runs what it finds as the system, so nothing else may come from a partner.
  "alter table outbox add column created_by_principal text default app_principal_id()",
  `create policy outbox_partner_read on outbox as restrictive for select to insyte_app
     using (${NOT_PARTNER} or created_by_principal = app_principal_id())`,
  `create policy outbox_partner_change on outbox as restrictive for update to insyte_app
     using (${NOT_PARTNER} or created_by_principal = app_principal_id())
     with check (${NOT_PARTNER} or created_by_principal = app_principal_id())`,
  `create policy outbox_partner_remove on outbox as restrictive for delete to insyte_app using (${NOT_PARTNER})`,
  `create policy outbox_partner_write on outbox as restrictive for insert to insyte_app
     with check (${NOT_PARTNER} or (
       app_principal_kind() = 'supplier_contact' and app_partner_id() is not null
       and created_by_principal = app_principal_id() and (
         event = 'records.changed'
         or (event = 'partner.changed' and payload ->> 'supplierId' = app_partner_id())
         or (event = 'supplier.problem_reported' and payload ->> 'supplierId' = app_partner_id()
             and payload ->> 'contactId' = app_principal_id())
         or (event = 'order.updated' and payload ->> 'change' = 'fulfil'
             and payload ->> 'supplierId' = app_partner_id()
             and payload ->> 'userId' = 'supplier_contact:' || app_principal_id()))))`,
  // The workspace's own tables: nothing for a partner principal.
  partnerBlind("workspaces"),
  partnerBlind("members"),
  partnerBlind("roles"),
  partnerBlind("teams"),
  partnerBlind("stores"),
  partnerBlind("workspace_counters"),
  partnerBlind("idempotency_keys"),
  partnerBlind("user_prefs"),
  partnerBlind("saved_views"),
  partnerBlind("todos"),
  partnerBlind("recents"),
  partnerBlind("return_settings"),
  partnerBlind("return_reasons"),
  partnerBlind("return_rules"),
  partnerBlind("claim_flows"),
  partnerBlind("fact_dirty_days"),
  partnerBlind("notification_settings"),
  partnerBlind("notification_deliveries"),
  partnerBlind("digests"),
  // The views the supplier use cases read (06 §6): only the supplier's own, whoever else asks sees nothing. The order
  // views run as their owner (not a superuser, no BYPASSRLS, so every other policy still holds) because the tables they
  // read are closed to partners; each filters to the calling supplier contact itself, so a member reads nothing here.
  `create view supplier_orders_v with (security_invoker = false) as
     select o.id, o.workspace_id, o.number, o.status as order_status, o.placed_at, o.currency,
            o.customer_name,
            jsonb_build_object(
              'name', coalesce(o.shipping_address ->> 'name', o.customer_name),
              'line1', o.shipping_address ->> 'line1', 'line2', o.shipping_address ->> 'line2',
              'postcode', o.shipping_address ->> 'postcode', 'city', o.shipping_address ->> 'city',
              'region', o.shipping_address ->> 'region', 'country', o.shipping_address ->> 'country'
            ) as ship_to,
            o.supplier_note,
            w.supplier_id, w.status as work_status, w.accepted_at, w.handoff_by, w.problem_kind, w.problem_note,
            w.problem_new_date, w.problem_reported_at, w.problem_resolved_at, w.shipped_at, w.carrier,
            w.tracking_number, w.tracking_url
     from orders o join supplier_work w on w.order_id = o.id
     where app_principal_kind() = 'supplier_contact' and w.supplier_id = app_partner_id()
       and o.workspace_id = app_workspace_id() and w.workspace_id = app_workspace_id()
       and exists (select 1 from forwarding_items f
                   where f.order_id = o.id and f.supplier_id = w.supplier_id and f.state <> 'cancelled')`,
  `create view supplier_lines_v with (security_invoker = false) as
     select l.id, l.workspace_id, l.order_id, f.supplier_id, l.shopify_id, l.product_id, l.variant_id, l.sku, l.title,
            l.variant_title, l.quantity, p.cost_minor as unit_cost_minor, p.images[1] as image
     from order_lines l
     join forwarding_items f on f.order_id = l.order_id and l.id = any(f.line_ids) and f.state <> 'cancelled'
     left join products p on p.id = l.product_id
     where app_principal_kind() = 'supplier_contact' and f.supplier_id = app_partner_id()
       and l.workspace_id = app_workspace_id() and f.workspace_id = app_workspace_id()
       and exists (select 1 from supplier_work w where w.order_id = l.order_id and w.supplier_id = f.supplier_id)`,
  `create view supplier_products_v with (security_invoker = false) as
     select p.id, p.workspace_id, p.title, p.status, p.images, ps.supplier_id, ps.lead_days, ps.stock_reporting,
            ps.is_primary
     from products p join product_supply ps on ps.product_id = p.id
     where app_principal_kind() = 'supplier_contact' and ps.supplier_id = app_partner_id()
       and p.workspace_id = app_workspace_id() and ps.workspace_id = app_workspace_id() and p.status <> 'archived'`,
  // A product's variants without their prices.
  `create view supplier_variants_v with (security_invoker = false) as
     select v.id, v.workspace_id, v.product_id, v.title, v.sku, v.position
     from variants v
     where app_principal_kind() = 'supplier_contact' and v.workspace_id = app_workspace_id()
       and exists (select 1 from product_supply ps where ps.product_id = v.product_id
                   and ps.supplier_id = app_partner_id())`,
  // The supplier itself: its name and timezone, not how the brand forwards to it.
  `create view supplier_self_v with (security_invoker = false) as
     select s.id, s.workspace_id, s.name, s.timezone
     from suppliers s
     where app_principal_kind() = 'supplier_contact' and s.id = app_partner_id()
       and s.workspace_id = app_workspace_id() and s.deleted_at is null`,
  // Its quality checks, as it reads them.
  `create view supplier_checks_v with (security_invoker = false) as
     select q.id, q.workspace_id, q.supplier_id, q.product_id, q.kind, q.status, q.variants, q.deliverables, q.due_at,
            q.note, q.submitted_at, q.decision_note, q.requested_at
     from quality_checks q
     where app_principal_kind() = 'supplier_contact' and q.supplier_id = app_partner_id()
       and q.workspace_id = app_workspace_id()`,
  // The workspace as a partner sees it: its name and look, nothing else.
  "create policy supplier_contacts_routing on supplier_contacts as permissive for select to insyte_owner using (true)",
  `create function partner_workspace() returns table (id text, name text, logo_file_id text, timezone text,
                                                      currency text)
     language plpgsql security definer set search_path = public, pg_temp as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       if prior is null or prior not in ('supplier_contact', 'affiliate') or app_partner_id() is null then
         return;
       end if;
       perform set_config('app.principal_kind', 'system', true);
       return query select w.id, w.name, w.logo_file_id, w.timezone, w.currency::text from workspaces w
                    where w.id = app_workspace_id() and w.deleted_at is null;
       perform set_config('app.principal_kind', prior, true);
     end $$`,
  "revoke all on function partner_workspace() from public",
  "grant execute on function partner_workspace() to insyte_app",
  "create view partner_workspace_v as select * from partner_workspace()",
  // The signed-in person's supplier contacts, across workspaces, for the session (`principalFrom`).
  `create function supplier_principals() returns table (contact_id text, workspace_id text, workspace_name text,
                                                        supplier_id text, supplier_name text, contact_name text,
                                                        role text, scopes text[], joined_at timestamptz)
     language plpgsql security definer set search_path = public, pg_temp as $$
     declare prior text := current_setting('app.principal_kind', true);
             who text := nullif(current_setting('app.user_id', true), '');
     begin
       if who is null then return; end if;
       perform set_config('app.principal_kind', 'system', true);
       return query
         select c.id, c.workspace_id, w.name, s.id, s.name, c.name, c.role, c.portal_scopes, c.joined_at
         from supplier_contacts c
         join suppliers s on s.id = c.supplier_id
         join workspaces w on w.id = c.workspace_id
         where c.user_id = who and c.revoked_at is null and c.joined_at is not null
           and s.deleted_at is null and w.deleted_at is null
         order by c.joined_at desc;
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function supplier_principals() from public",
  "grant execute on function supplier_principals() to insyte_app",
  // The order's own status follows every leg, not just the supplier's own (which is all it can see): read as system,
  // for an order the calling supplier works on, after its leg moved.
  `create function supplier_order_settle(p_order text) returns void
     language plpgsql security definer set search_path = public, pg_temp as $$
     declare prior text := current_setting('app.principal_kind', true);
             partner text := nullif(current_setting('app.partner_id', true), '');
     begin
       if prior is distinct from 'supplier_contact' or partner is null then return; end if;
       perform set_config('app.principal_kind', 'system', true);
       if exists (select 1 from supplier_work w where w.order_id = p_order and w.supplier_id = partner) then
         update orders o set status = case
             when o.status = 'paid' and not exists (select 1 from forwarding_items f
               where f.order_id = o.id and f.state not in ('confirmed', 'cancelled')) then 'at_supplier'
             when o.status = 'at_supplier' and exists (select 1 from forwarding_items f
               where f.order_id = o.id and f.state not in ('confirmed', 'cancelled')) then 'paid'
             else o.status end
         where o.id = p_order;
       end if;
       perform set_config('app.principal_kind', prior, true);
     end $$`,
  // Accepting a supplier portal invitation (M16 step 2), as the signed-in person in its workspace: they read no member
  // table and hold no contact yet, so the join is checked and made here. Only an open invitation of the person's own
  // address, by its secret (the link's, hashed), for a supplier that is still there. The supplier's first contact is its
  // owner, decided under the supplier's row lock so two people joining at once do not both become it. Answers the
  // contact, or null when there is nothing to accept.
  `create function supplier_contact_join(p_invitation text, p_token_hash bytea, p_id text) returns text
     language plpgsql security definer set search_path = public, pg_temp as $$
     declare prior text := current_setting('app.principal_kind', true);
             who text := nullif(current_setting('app.user_id', true), '');
             ws text := nullif(current_setting('app.workspace_id', true), '');
             inv invitations%rowtype;
             owned boolean;
             result text;
     begin
       if who is null or ws is null or p_token_hash is null then return null; end if;
       perform set_config('app.principal_kind', 'system', true);
       select i.* into inv from invitations i
       where i.id = p_invitation and i.workspace_id = ws and i.kind = 'supplier_portal' and i.token_hash = p_token_hash
         and i.accepted_at is null and i.revoked_at is null and i.declined_at is null and i.expires_at > now()
         and i.email = (select lower(u.email) from auth."user" u where u.id = who)
       for update;
       if found then
         perform 1 from suppliers s where s.id = inv.supplier_id and s.deleted_at is null for update;
         if not found then
           perform set_config('app.principal_kind', coalesce(prior, ''), true);
           return null;
         end if;
         owned := exists (select 1 from supplier_contacts c where c.supplier_id = inv.supplier_id
                          and c.role = 'owner' and c.revoked_at is null and c.user_id <> who);
         select c.id into result from supplier_contacts c where c.supplier_id = inv.supplier_id and c.user_id = who;
         if result is null then
           result := p_id;
           insert into supplier_contacts (id, workspace_id, supplier_id, user_id, name, role, portal_scopes, invited_by,
                                          joined_at)
           values (result, ws, inv.supplier_id, who,
                   coalesce(inv.name, (select u.name from auth."user" u where u.id = who), inv.email),
                   case when owned then 'staff' else 'owner' end, coalesce(inv.portal_scopes, '{orders}'),
                   inv.invited_by, now());
         else
           update supplier_contacts set revoked_at = null, joined_at = now(),
                    portal_scopes = coalesce(inv.portal_scopes, '{orders}'),
                    role = case when owned then 'staff' else role end
           where id = result;
         end if;
         update invitations set accepted_at = now(), accepted_by_user = who where id = inv.id;
       end if;
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
       return result;
     end $$`,
  "revoke all on function supplier_contact_join(text, bytea, text) from public",
  "grant execute on function supplier_contact_join(text, bytea, text) to insyte_app",
  "revoke all on function supplier_order_settle(text) from public",
  "grant execute on function supplier_order_settle(text) to insyte_app",
  // The views to the app only; the order views' owner reads what the closed tables hold for them.
  `revoke all on supplier_orders_v, supplier_lines_v, supplier_products_v, supplier_variants_v, supplier_self_v,
     supplier_checks_v, partner_workspace_v from public`,
  `grant select on supplier_orders_v, supplier_lines_v, supplier_products_v, supplier_variants_v, supplier_self_v,
     supplier_checks_v, partner_workspace_v to insyte_app`
)

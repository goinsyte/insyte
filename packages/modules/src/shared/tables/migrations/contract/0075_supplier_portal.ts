import { partnerBlind, supplierProjection } from "@insyte/database/Tenancy"
import { statements } from "../../statements.ts"

/**
 * The supplier portal (M16 steps 1–2; domain.md §18.1, 06 §5–§6). A supplier contact is a principal of its own: one
 * workspace, one supplier. The members-only tables it works on open to it through one restrictive policy each, for its
 * own supplier's rows only (`app_partner_id()`), and the use cases read them through column-hiding views that show no
 * customer email or phone, no totals or shelf prices, no other supplier's lines and never the internal note (only
 * `orders.supplier_note`). The workspace's own tables (the team, its roles, its stores, its settings) shut partner
 * principals out entirely; the workspace row itself is read through `partner_workspace_v`.
 *
 * A contract migration because it replaces the members-only policies of the tables it opens.
 */

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
  // Family S: the supplier projection.
  supplierProjection("suppliers", "id = app_partner_id()"),
  supplierProjection("supplier_contacts", "id = app_principal_id() and supplier_id = app_partner_id()"),
  supplierProjection("supplier_work", "supplier_id = app_partner_id()"),
  supplierProjection("forwarding_items", "supplier_id = app_partner_id()"),
  supplierProjection("product_supply", "supplier_id = app_partner_id()"),
  supplierProjection("supplier_integrations", "supplier_id = app_partner_id()"),
  supplierProjection(
    "orders",
    "exists (select 1 from supplier_work w where w.order_id = orders.id and w.supplier_id = app_partner_id())"
  ),
  supplierProjection("order_lines", OWN_LINE("order_lines")),
  supplierProjection("products", OWN_PRODUCT("products.id")),
  supplierProjection("variants", OWN_PRODUCT("variants.product_id")),
  supplierProjection(
    "inventory_levels",
    `exists (select 1 from variants v join product_supply ps on ps.product_id = v.product_id
             where v.id = inventory_levels.variant_id and ps.supplier_id = app_partner_id())`
  ),
  supplierProjection("supplier_statements", "supplier_id = app_partner_id()"),
  supplierProjection("supplier_statement_lines", "supplier_id = app_partner_id()"),
  // Quality checks were the workspace's alone (the supplier answered through a signed link, as `system`).
  supplierProjection("quality_checks", "supplier_id = app_partner_id()", { replaces: false }),
  supplierProjection(
    "quality_check_media",
    "exists (select 1 from quality_checks q where q.id = quality_check_media.check_id and q.supplier_id = app_partner_id())",
    { replaces: false }
  ),
  supplierProjection(
    "files",
    `uploaded_by = app_principal_id() or (owner_type = 'quality_check' and exists (
       select 1 from quality_checks q where q.id = files.owner_id and q.supplier_id = app_partner_id()))`,
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
  // The views the supplier use cases read (06 §6): only the supplier's own, whoever else asks sees nothing.
  `create view supplier_orders_v with (security_invoker = true) as
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
     where w.supplier_id = app_partner_id()
       and exists (select 1 from forwarding_items f
                   where f.order_id = o.id and f.supplier_id = w.supplier_id and f.state <> 'cancelled')`,
  `create view supplier_lines_v with (security_invoker = true) as
     select l.id, l.workspace_id, l.order_id, f.supplier_id, l.product_id, l.variant_id, l.sku, l.title,
            l.variant_title, l.quantity, p.cost_minor as unit_cost_minor, p.images[1] as image
     from order_lines l
     join forwarding_items f on f.order_id = l.order_id and l.id = any(f.line_ids) and f.state <> 'cancelled'
     left join products p on p.id = l.product_id
     where f.supplier_id = app_partner_id()`,
  `create view supplier_products_v with (security_invoker = true) as
     select p.id, p.workspace_id, p.title, p.status, p.images, ps.supplier_id, ps.lead_days, ps.stock_reporting,
            ps.is_primary
     from products p join product_supply ps on ps.product_id = p.id
     where ps.supplier_id = app_partner_id() and p.status <> 'archived'`,
  // The workspace as a partner sees it: its name and look, nothing else.
  "create policy supplier_contacts_routing on supplier_contacts as permissive for select to insyte_owner using (true)",
  `create function partner_workspace() returns table (id text, name text, logo_file_id text, timezone text,
                                                      currency text)
     language plpgsql security definer set search_path = public as $$
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
     language plpgsql security definer set search_path = public as $$
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
     language plpgsql security definer set search_path = public as $$
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
  // address; the supplier's first contact is its owner. Answers the contact, or null when there is nothing to accept.
  `create function supplier_contact_join(p_invitation text, p_id text) returns text
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
             who text := nullif(current_setting('app.user_id', true), '');
             ws text := nullif(current_setting('app.workspace_id', true), '');
             inv invitations%rowtype;
             result text;
     begin
       if who is null or ws is null then return null; end if;
       perform set_config('app.principal_kind', 'system', true);
       select i.* into inv from invitations i
       where i.id = p_invitation and i.workspace_id = ws and i.kind = 'supplier_portal'
         and i.accepted_at is null and i.revoked_at is null and i.declined_at is null and i.expires_at > now()
         and i.email = (select lower(u.email) from auth."user" u where u.id = who)
       for update;
       if found then
         select c.id into result from supplier_contacts c where c.supplier_id = inv.supplier_id and c.user_id = who;
         if result is null then
           result := p_id;
           insert into supplier_contacts (id, workspace_id, supplier_id, user_id, name, role, portal_scopes, invited_by,
                                          joined_at)
           values (result, ws, inv.supplier_id, who,
                   coalesce(inv.name, (select u.name from auth."user" u where u.id = who), inv.email),
                   case when exists (select 1 from supplier_contacts c where c.supplier_id = inv.supplier_id
                                     and c.revoked_at is null) then 'staff' else 'owner' end,
                   inv.portal_scopes, inv.invited_by, now());
         else
           update supplier_contacts set revoked_at = null, joined_at = now(), portal_scopes = inv.portal_scopes
           where id = result;
         end if;
         update invitations set accepted_at = now(), accepted_by_user = who where id = inv.id;
       end if;
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
       return result;
     end $$`,
  "revoke all on function supplier_contact_join(text, text) from public",
  "grant execute on function supplier_contact_join(text, text) to insyte_app",
  "revoke all on function supplier_order_settle(text) from public",
  "grant execute on function supplier_order_settle(text) to insyte_app"
)

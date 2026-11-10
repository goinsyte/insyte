import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * Product quality (M9.4): checks the team asks a product's supplier for (photos of a batch, a sample, a test order),
 * what the supplier sent back, and the verdict; the product's phase; the workspace's complaint threshold. The supplier
 * answers through a signed link until the partner portal (M16): `route_quality_check` finds a check's workspace before
 * anything else is read. Complaints are not a table: they are the returns whose reason counts for quality.
 */
export default statements(
  `create table quality_checks (
     id               text primary key,
     workspace_id     text not null references workspaces(id) on delete cascade,
     product_id       text not null references products(id) on delete cascade,
     supplier_id      text not null references suppliers(id) on delete cascade,
     kind             text not null check (kind in ('sample', 'batch', 'test_order')),
     variants         text[] not null default '{}',
     deliverables     text[] not null check (cardinality(deliverables) > 0),
     due_at           timestamptz not null,
     status           text not null default 'requested'
                        check (status in ('requested', 'submitted', 'approved', 'rejected')),
     note             text not null default '',
     requested_by     text not null,
     requested_at     timestamptz not null default now(),
     submitted_at     timestamptz,
     submitted_by     text,
     batch            text,
     submission_note  text,
     video            boolean not null default false,
     decided_at       timestamptz,
     decided_by       text,
     decision_note    text
   )`,
  "create index quality_checks_product on quality_checks (workspace_id, product_id, requested_at desc)",
  tenantTable("quality_checks"),
  "create policy quality_checks_routing on quality_checks as permissive for select to insyte_owner using (true)",
  `create table quality_check_media (
     workspace_id text not null references workspaces(id) on delete cascade,
     check_id     text not null references quality_checks(id) on delete cascade,
     file_id      text not null references files(id) on delete cascade,
     position     integer not null,
     primary key (check_id, file_id)
   )`,
  tenantTable("quality_check_media"),
  `create table product_phases (
     workspace_id text not null references workspaces(id) on delete cascade,
     product_id   text primary key references products(id) on delete cascade,
     phase        text not null check (phase in ('test', 'active', 'watch', 'phased_out')),
     changed_by   text not null,
     changed_at   timestamptz not null default now()
   )`,
  tenantTable("product_phases", { membersOnly: true }),
  `create table quality_settings (
     workspace_id  text primary key references workspaces(id) on delete cascade,
     threshold_pct numeric(5,2) not null default 5 check (threshold_pct between 0 and 100)
   )`,
  tenantTable("quality_settings", { membersOnly: true }),
  `create function route_quality_check(check_id text) returns table (workspace_id text)
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       return query select q.workspace_id from quality_checks q where q.id = check_id;
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function route_quality_check(text) from public",
  "grant execute on function route_quality_check(text) to insyte_app"
)

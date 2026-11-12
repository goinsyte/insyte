import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * Sending domains (M17 step 20.1c; widgets/05 §7.4): which workspace a sending domain at Resend is. Every workspace's
 * domain is made on one Resend account, so the name is claimed here first, unique across workspaces, and only then made
 * at Resend: another workspace's name is refused before Resend is asked, and a set-up whose answer was lost is this
 * workspace's to pick up again (the domain Resend made after `claimed_at`).
 *
 * - `sending_domains`: one per workspace. `provider_id` is Resend's id once the make went through; `verified_at` is when
 *   it was first seen verified. A claim never verified is let go after a while (the daily re-check), and "Domein
 *   verwijderen" lets it go at once.
 * - `sending_domains_due()`: the workspaces with a claim, for the daily re-check, read before any workspace is in
 *   scope, as retention's is (0061).
 */
export default statements(
  `create table sending_domains (
     workspace_id text primary key references workspaces(id) on delete cascade,
     name         text not null unique check (name = lower(name) and length(name) between 4 and 253),
     provider_id  text,
     claimed_at   timestamptz not null default now(),
     verified_at  timestamptz
   )`,
  tenantTable("sending_domains", { membersOnly: true }),
  // Routing reads for the function below, which runs as `insyte_owner` and so sees no workspace's rows otherwise.
  "create policy sending_domains_routing on sending_domains as permissive for select to insyte_owner using (true)",
  `create function sending_domains_due() returns table (workspace_id text)
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       return query select d.workspace_id from sending_domains d
                    join workspaces w on w.id = d.workspace_id
                    where w.deleted_at is null
                    order by d.claimed_at;
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function sending_domains_due() from public",
  "grant execute on function sending_domains_due() to insyte_app"
)

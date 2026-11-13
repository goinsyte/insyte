import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * Kosten (M13 step 5; domain.md §10.1, widgets/02 `/costs`): what the shop costs per month, so revenue becomes net
 * profit in Kosten, Analyse and Rekenbladen.
 *
 * - `cost_lines`: one post per kind of cost. `fixed` and `ads` are typed per month; `per_order` carries `rate_minor`
 *   (an amount per counted order) and `percent` `rate` (a share of revenue, 0 to 100). An ad line names where its spend
 *   is read from (`source`, and the account once one is connected); a removed line keeps its row (`deleted_at`) for
 *   its Undo.
 * - `cost_line_amounts`: only the months someone typed, in the line's currency. A typed amount wins over what an ad
 *   account reports; "Weer uit … lezen" deletes them.
 * - `ad_spend_day`: the spend an ad account reports per day and campaign, read by the daily sync from the Meta
 *   Marketing API and Google Ads. Nothing writes it until an account can be connected; until then an ad line is typed.
 * - `costs.write` ("Kosten bewerken", beside Analyse · Bekijken) is new in the catalogue: the system roles that hold it
 *   by default (Eigenaar, Beheerder, Financiën) get it in every workspace that has them, unless the workspace already
 *   decided. The roles table forces its policy on its owner too, so the backfill steps outside it for one statement,
 *   on this migration's transaction.
 */
export default statements(
  `create table cost_lines (
     id            text primary key,
     workspace_id  text not null references workspaces(id) on delete cascade,
     name          text not null check (char_length(name) between 1 and 80),
     kind          text not null check (kind in ('fixed', 'per_order', 'percent', 'ads')),
     rate          numeric(7,4) check (rate between 0 and 100),
     rate_minor    bigint check (rate_minor >= 0),
     currency      char(3) not null,
     source        text not null default 'manual' check (source in ('manual', 'meta', 'google_ads')),
     connection_id text references connections(id) on delete set null,
     channel       text,
     position      integer not null default 0,
     created_by    text,
     created_at    timestamptz not null default now(),
     updated_at    timestamptz not null default now(),
     deleted_at    timestamptz,
     check (kind <> 'percent' or rate is not null),
     check (kind <> 'per_order' or rate_minor is not null),
     check (kind = 'ads' or source = 'manual')
   )`,
  "create index cost_lines_workspace on cost_lines (workspace_id, position) where deleted_at is null",
  "create trigger cost_lines_touch before update on cost_lines for each row execute function touch_updated_at()",
  tenantTable("cost_lines", { membersOnly: true }),
  `create table cost_line_amounts (
     line_id      text not null references cost_lines(id) on delete cascade,
     workspace_id text not null references workspaces(id) on delete cascade,
     month        date not null check (extract(day from month) = 1),
     amount_minor bigint not null check (amount_minor >= 0),
     currency     char(3) not null,
     typed_by     text,
     typed_at     timestamptz not null default now(),
     primary key (line_id, month)
   )`,
  "create index cost_line_amounts_workspace on cost_line_amounts (workspace_id, month)",
  tenantTable("cost_line_amounts", { membersOnly: true }),
  `create table ad_spend_day (
     workspace_id  text not null references workspaces(id) on delete cascade,
     connection_id text not null references connections(id) on delete cascade,
     provider      text not null check (provider in ('meta', 'google_ads')),
     account_ref   text not null,
     campaign_ref  text not null default '',
     channel       text,
     day           date not null,
     spend_minor   bigint not null check (spend_minor >= 0),
     currency      char(3) not null,
     synced_at     timestamptz not null default now(),
     primary key (connection_id, day, campaign_ref)
   )`,
  "create index ad_spend_day_range on ad_spend_day (workspace_id, provider, day)",
  tenantTable("ad_spend_day", { membersOnly: true }),
  // The daily sync's workspaces, read across workspaces as the owner: those with a connected ad account. Ids only.
  `create function ad_spend_workspaces() returns table (workspace_id text)
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       return query select distinct c.workspace_id from connections c
         where c.provider in ('meta', 'google_ads') and c.status = 'connected';
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "create policy connections_ad_spend_routing on connections as permissive for select to insyte_owner using (true)",
  "revoke all on function ad_spend_workspaces() from public",
  "grant execute on function ad_spend_workspaces() to insyte_app",
  "alter table roles no force row level security",
  `update roles set specials = specials || '{"costs.write": true}'::jsonb
     where kind = 'system' and id in ('owner', 'admin', 'finance') and (specials -> 'costs.write') is null`,
  "alter table roles force row level security"
)

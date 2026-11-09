import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/**
 * The first analysis (M6.5; widgets/01 analysis step): one per store, read straight after its first import. `state`
 * is `reading` while the Workflow reads, then `early` (the setup read, no finding: the finding path is M15) or `failed`.
 * `reads` is the checklist the step ticks off; `setup` the facts read from Shopify and the mirror, kept as the basis
 * every prediction names; `predictions` and `watch` what the step shows. The operator's `answers` and the items they
 * chose to have `prepared` are saved by `FirstAnalysis.prepare`: what cannot be made yet (the automation until M12,
 * the sheet until M14, the agent until M15) waits here until it can.
 */
export default statements(
  `create table first_analyses (
     id           text primary key,
     workspace_id text not null references workspaces(id) on delete cascade,
     store_id     text not null references stores(id) on delete cascade,
     state        text not null default 'reading' check (state in ('reading', 'early', 'failed')),
     reads        jsonb not null default '[]',
     setup        jsonb,
     predictions  jsonb not null default '[]',
     watch        jsonb not null default '[]',
     titles       jsonb not null default '{}',
     answers      jsonb,
     prepared     text[] not null default '{}',
     started_at   timestamptz not null default now(),
     finished_at  timestamptz,
     prepared_at  timestamptz
   )`,
  "create unique index first_analyses_store on first_analyses (store_id)",
  "create index first_analyses_workspace on first_analyses (workspace_id)",
  tenantTable("first_analyses", { membersOnly: true })
)

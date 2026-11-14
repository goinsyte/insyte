import { statements } from "../statements.ts"

/*
 * The first analysis made real (M15 step 5; domain.md §9.10). The reading can now end in a finding (`found`): the one
 * problem the store's own mail and parcels show, with its evidence, kept in `finding`. "Klaarzetten" makes what was
 * chosen through each item's own slice and keeps the ids in `made` (`{ automationId, sheetId }`); what cannot be made
 * yet (the customer agent, M15.8) stays in `prepared` only. The offline plan the operator agreed is kept in `offline`
 * (`{ window, levels, hours, version }`): the levels went into the autonomy policy as version `version`, the hours
 * wait for the customer agent.
 */
export default statements(
  "alter table first_analyses drop constraint first_analyses_state_check",
  "alter table first_analyses add constraint first_analyses_state_check check (state in ('reading', 'early', 'found', 'failed'))",
  `alter table first_analyses add column finding jsonb,
     add column made jsonb not null default '{}',
     add column offline jsonb,
     add column offline_at timestamptz`
)

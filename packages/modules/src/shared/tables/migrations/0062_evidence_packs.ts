import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * Evidence packs (M13 step 4; domain.md §8): what Insyte gathered for a case, and how far it got. One pack per case,
 * assembled again in place: each assembly is a run (`run_id`, the `EvidencePackWorkflow` instance), and a step of an
 * older run changes nothing. `progress_done` of `progress_total` documents are in; `narrative_text` is the drafted
 * account the team reads first (a template now, the AI's draft in M15). The documents themselves are `evidence_items`
 * with `source = 'insyte'` and `source_ref = '<run>:<kind>'`, each a file of its own, so a provider gets each kind where
 * it asks for it. The submission columns (`pdf_file_id`, `submitted_payload_hash`, `provider_submission_id`,
 * `proposal_id`) stay empty until a payment connection submits the pack (M13 step 2).
 */
export default statements(
  `create table evidence_packs (
     id                     text primary key,
     workspace_id           text not null references workspaces(id) on delete cascade,
     chargeback_id          text not null unique references chargebacks(id) on delete cascade,
     state                  text not null default 'assembling'
                              check (state in ('assembling', 'ready', 'submitted', 'failed')),
     run_id                 text not null,
     assembled_by           text not null default 'insyte',
     requested_by           text,
     narrative_text         text not null default '' check (char_length(narrative_text) <= 20000),
     progress_done          integer not null default 0 check (progress_done >= 0),
     progress_total         integer not null default 0 check (progress_total >= 0),
     error                  text,
     pdf_file_id            text references files(id) on delete set null,
     proposal_id            text,
     submitted_payload_hash text,
     provider_submission_id text,
     started_at             timestamptz not null default now(),
     ready_at               timestamptz,
     created_at             timestamptz not null default now(),
     updated_at             timestamptz not null default now()
   )`,
  "create trigger evidence_packs_touch before update on evidence_packs for each row execute function touch_updated_at()",
  tenantTable("evidence_packs", { membersOnly: true }),
  "create index evidence_items_source on evidence_items (chargeback_id, source_ref) where source_ref is not null"
)

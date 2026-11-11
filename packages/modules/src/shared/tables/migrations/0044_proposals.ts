import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * Plates and proposals (M10.2; ADR-0014, domain.md §9.2, §12.7): what Insyte drew for a queue row, as a record. The
 * proposal holds the typed command filing runs (`action`, Schema-encoded) and its state; each drawing of it is a
 * revision (the words, the before and after, the confidence and what it rests on, what filing does). Until M15 a
 * rule-based proposer draws them from the records; the model later writes revisions into the same table. Filing runs
 * the command as the person (`filed_by`, `on_behalf_of`), with their permissions at that moment.
 *
 * `dedupe_key` is the touchpoint (`approve:{returnId}`): one open proposal per key. `queue_item_id` is the queue row it
 * was drawn for, so a plate set aside is not drawn again for the same row.
 */
export default statements(
  `create table proposals (
     id               text primary key,
     workspace_id     text not null references workspaces(id) on delete cascade,
     store_id         text references stores(id) on delete cascade,
     origin           text not null check (origin in ('queue', 'ask', 'analytics_finding', 'low_stock', 'order_advice',
                                                      'evidence_pack', 'automation_recommendation', 'draft_reply')),
     queue_item_id    text references queue_items(id) on delete set null,
     area             text not null,
     subject_type     text not null,
     subject_id       text not null,
     number           text not null,
     action           jsonb not null,
     dedupe_key       text not null,
     state            text not null default 'open'
                        check (state in ('open', 'filed', 'executed', 'execution_failed', 'discarded', 'superseded',
                                         'reverted')),
     current_revision integer not null default 1,
     filed_by         text,
     filed_at         timestamptz,
     on_behalf_of     text,
     discarded_by     text,
     discarded_at     timestamptz,
     executed_at      timestamptz,
     execution_error  text,
     expires_at       timestamptz,
     created_at       timestamptz not null default now(),
     updated_at       timestamptz not null default now()
   )`,
  "create unique index proposals_open on proposals (workspace_id, dedupe_key) where state = 'open'",
  "create index proposals_queue_item on proposals (queue_item_id) where queue_item_id is not null",
  "create index proposals_subject on proposals (workspace_id, subject_type, subject_id)",
  "create trigger proposals_touch before update on proposals for each row execute function touch_updated_at()",
  tenantTable("proposals", { membersOnly: true }),
  `create table proposal_revisions (
     workspace_id     text not null references workspaces(id) on delete cascade,
     proposal_id      text not null references proposals(id) on delete cascade,
     revision         integer not null,
     heading          text not null,
     body             text not null,
     dimension        text not null,
     before           jsonb not null,
     after            jsonb not null,
     change           text not null,
     witness          text not null,
     confidence       numeric(4, 3) not null check (confidence between 0 and 1),
     confidence_basis text not null,
     file_label       text not null,
     evidence         jsonb not null default '[]',
     why              text not null,
     prompt_version   text,
     model            text,
     model_call_id    text,
     created_at       timestamptz not null default now(),
     primary key (proposal_id, revision)
   )`,
  tenantTable("proposal_revisions", { membersOnly: true })
)

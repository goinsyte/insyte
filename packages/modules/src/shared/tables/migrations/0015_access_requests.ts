import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/**
 * Asking for access (M3.5, domain.md §2.6): from a denied state's "Toegang vragen", for the area and level it names.
 * Granting raises the area on the asker's role, not on the person. One open request per member and area.
 */
export default statements(
  `create table access_requests (
     id           text primary key,
     workspace_id text not null references workspaces(id) on delete cascade,
     member_id    text not null references members(id) on delete cascade,
     role_id      text not null,
     area         text not null,
     level        int not null check (level between 1 and 3),
     path         text,
     state        text not null default 'open' check (state in ('open', 'granted', 'declined', 'withdrawn')),
     decided_by   text,
     decided_at   timestamptz,
     created_at   timestamptz not null default now()
   )`,
  `create unique index access_requests_open on access_requests (workspace_id, member_id, area) where state = 'open'`,
  "create index access_requests_recent on access_requests (workspace_id, created_at desc)",
  tenantTable("access_requests", { membersOnly: true })
)

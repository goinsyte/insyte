import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/**
 * Who has been asked into a workspace, and the one link anyone may pass on (06 §3.2, M3.4).
 *
 * An invitation's id is in its link and in the audit log, so the link also carries a secret: derived on the server from
 * the id and the round (a resend starts the next round, and the previous link stops working), stored only as its hash.
 * The shareable link is the same, per workspace. An invitation takes a seat until it is accepted, revoked or lapses.
 *
 * A removed member keeps their row (`removed_at`) for the undo window and for authorship; they no longer count, and
 * an invitation accepted later brings the same row back. `contract/0013` hides the workspace from them.
 */
export default statements(
  `create table invitations (
     id                text primary key,
     workspace_id      text not null references workspaces(id) on delete cascade,
     kind              text not null default 'team' check (kind in ('team', 'supplier_portal', 'affiliate')),
     email             text not null check (email = lower(email)),
     name              text,
     token_hash        bytea not null,
     round             int not null default 0,
     role_id           text,
     stores            jsonb,
     supplier_id       text,
     portal_scopes     text[],
     affiliate_tier    text,
     message           text check (length(message) <= 500),
     invited_by        text not null references members(id),
     sent_at           timestamptz not null default now(),
     expires_at        timestamptz not null,
     accepted_at       timestamptz,
     accepted_by_user  text,
     declined_at       timestamptz,
     revoked_at        timestamptz,
     revoked_by        text,
     requested_new_at  timestamptz,
     seat_requested_at timestamptz,
     -- What a resend replaced (round, token_hash, sent_at, expires_at), so its undo puts the previous link back.
     previous          jsonb,
     foreign key (workspace_id, role_id) references roles(workspace_id, id),
     check (kind <> 'team' or role_id is not null)
   )`,
  // One open invitation per address and kind: a second send to the same address renews the first.
  `create unique index invitations_open on invitations (workspace_id, kind, email)
     where accepted_at is null and revoked_at is null and declined_at is null`,
  tenantTable("invitations", { membersOnly: true }),
  //
  `create table invite_links (
     workspace_id text primary key references workspaces(id) on delete cascade,
     enabled      boolean not null default false,
     token_hash   bytea not null,
     round        int not null default 0,
     role_id      text not null,
     days         int not null check (days in (1, 7, 30)),
     created_at   timestamptz not null default now(),
     expires_at   timestamptz not null,
     joined_count int not null default 0,
     -- What "Nieuwe link" replaced (round, token_hash, created_at, expires_at, joined_count), for its undo.
     previous     jsonb,
     foreign key (workspace_id, role_id) references roles(workspace_id, id)
   )`,
  tenantTable("invite_links", { membersOnly: true }),
  //
  "alter table members add column removed_at timestamptz"
)

import { statements } from "../statements.ts"

/**
 * Who may create an account while Insyte is invite-only (M2.2): an address, or a whole domain written `@domain`. Read
 * by the sign-up hook; written by staff (`bun run beta:allow`), never by the app, so `insyte_app` may only read it.
 * An open invitation (step 3) admits an address too, without a row here.
 */
export default statements(
  `create table beta_allowlist (
     entry    text primary key check (entry = lower(entry) and (entry ~ '^@[^@\\s]+\\.[^@\\s]+$' or entry ~ '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$')),
     note     text,
     added_at timestamptz not null default now()
   )`,
  "revoke insert, update, delete on beta_allowlist from insyte_app"
)

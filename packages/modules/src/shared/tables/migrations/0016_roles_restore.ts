import { statements } from "../statements.ts"

/**
 * A custom role that was deleted can be put back for its undo window (M3.2): it stays as a row with `deleted_at`, and
 * `moved` records who went where (`{ to, members, invitations, link }`), so the undo returns exactly those.
 */
export default statements(
  "alter table roles add column deleted_at timestamptz",
  "alter table roles add column moved jsonb"
)

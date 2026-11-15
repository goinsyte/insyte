import { statements } from "../statements.ts"

/*
 * Settings that take effect (M17 step 20.1b, W10.4).
 *
 * - `files.published_at`: when a logo was first saved at Huisstijl, so anyone may load it from then on
 *   (`GET /api/brand/:workspace/logo/:file`). A mail sent with an older logo keeps its image after the logo is replaced;
 *   a logo uploaded and never saved stays private. Every logo saved now is marked.
 * - `deliveries.stage`: what AfterShip says beyond the status, which Verzending words on its own: ready at a pickup
 *   point (status `in_transit`) or a missed delivery (status `exception`). The status itself is unchanged, so the delay
 *   checks read the parcel as before.
 */
export default statements(
  "alter table files add column published_at timestamptz",
  "alter table deliveries add column stage text check (stage in ('available_for_pickup', 'failed_attempt'))",
  "alter table files no force row level security",
  "alter table workspace_settings no force row level security",
  `update files f set published_at = now()
     from workspace_settings s
     where s.workspace_id = f.workspace_id and s.section = 'brand' and s.value ->> 'logoFileId' = f.id
       and f.kind = 'logo'`,
  "alter table workspace_settings force row level security",
  "alter table files force row level security"
)

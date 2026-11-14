import { RoleSnapshot } from "@insyte/domain/Principal"
import { Teammate } from "@insyte/modules/members/domain/Team"
import { NoteCounts } from "@insyte/modules/notifications/domain/Notifications"
import { Prefs } from "@insyte/modules/prefs/domain/Prefs"
import { SearchHit, SearchKind } from "@insyte/modules/shared/domain/Search"
import { HealthLine } from "@insyte/modules/stores/domain/Health"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

/*
 * The signed-in frame (M5.3): one round trip for its first paint, the route tree's root loader. ADR-0028: the frame
 * renders with real counts or none, never a made-up number; a count the server does not keep yet is absent, and the
 * panel hides its badge.
 */

/** A count per panel item (by its path); absent when the area is not counted yet. */
export const NavCounts = Schema.Record(Schema.String, Schema.Int)

export class Frame extends Schema.Class<Frame>("shell/Frame")({
  workspace: Schema.Struct({ id: Schema.String, name: Schema.String }),
  me: Schema.Struct({
    memberId: Schema.String,
    name: Schema.String,
    email: Schema.String,
    image: Schema.NullOr(Schema.String)
  }),
  /** The role as of this request, for what the rail and the panel may open. */
  role: RoleSnapshot,
  prefs: Prefs,
  notes: NoteCounts,
  teammates: Schema.Array(Teammate),
  counts: NavCounts,
  /** Proposals ready to review (M15); `null` until Insyte drafts them, so the top bar shows no button. */
  proposals: Schema.NullOr(Schema.Int),
  /** Every store connection's state in one line (M17 step 6): what the shell says about the sync. */
  health: HealthLine
}) {}

export class ShellRpcs extends RpcGroup.make(
  Rpc.make("Shell.frame", { payload: Schema.Struct({ path: Schema.String }), success: Frame }),
  // The shell's health line on its own, read again when a connection changes (`records.changed connection`).
  Rpc.make("Shell.health", { success: HealthLine }),
  Rpc.make("Nav.counts", { payload: Schema.Struct({ area: Schema.String }), success: NavCounts }),
  // The one search (api.md): the palette, the bookmark picker, Ask's `@`. Kinds join as their tables land.
  Rpc.make("Search.records", {
    payload: Schema.Struct({
      q: Schema.String,
      kinds: Schema.optional(Schema.Array(SearchKind)),
      limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 20 })))
    }),
    success: Schema.Array(SearchHit)
  })
)
  // Innermost first: `Member` needs the person (`Authenticated`) and the connection (`WithDb`) around it.
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}

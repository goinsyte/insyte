import type { AreaId, SpecialId } from "@insyte/domain/Permissions"
import { Schema } from "effect"
import { UndoTicket } from "../../shared/domain/Undo.ts"

/*
 * The Prullenbak (M17 step 20.1a; domain.md §16.1, widgets/05 §7.8): what was deleted in the last 30 days, over
 * `trash_items_v`, whatever its slice. Putting an item back is its own slice's command, with that command's undo;
 * purging is irreversible and asks first. Times are epoch milliseconds.
 */

/** Days an item stays in the Prullenbak before the daily sweep purges it (`TRASH_DAYS` in the design). */
export const TRASH_DAYS = 30

/**
 * The kinds the view holds, and what each takes. **Adding a kind** (the Kennisbank's items, say) is: its name here, its
 * rule in `TRASH_KINDS`, its `select` in the view (a migration over `trashView`, see `0101_trash_kinds.ts`), its
 * put-back and purge in `TrashKindsLive` (`apps/api/src/platform/links/TrashKinds.ts`), and its word and icon on the
 * page (`KIND` in the console's `trash-source.tsx` and `trash-screen.tsx`). Nothing in the use cases names a kind.
 */
export const TrashKind = Schema.Literals([
  "ticket",
  "automation",
  "sheet",
  "course",
  "webhook",
  "cost_line",
  "supplier"
])
export type TrashKind = typeof TrashKind.Type

/** What a kind takes: the area it belongs to, and the level there to see it, put it back, and purge it. */
export interface TrashKindRule {
  readonly area: AreaId
  readonly see: 1 | 2 | 3
  readonly restore: 1 | 2 | 3
  readonly purge: 1 | 2 | 3
  /** A special action putting it back and purging it also take, as its slice's own commands do. */
  readonly action?: SpecialId
  /** Only its owner (`trash_items_v.owner_id`) sees, puts back and purges it: a sheet is personal. */
  readonly ownerOnly?: true
}

/**
 * Each kind's rule, as its slice already has it: a ticket is seen at Bekijken, put back at Bewerken, purged at Beheren
 * (Tickets' own put-back of a deleted one takes Beheren too); an automation and a course are removed at Beheren, so
 * they come back and go for good there; a webhook endpoint is removed at Bewerken; a cost line and a sheet are made
 * and removed at Bekijken (cost lines with the `costs.write` action), a sheet by its owner only; a supplier is removed
 * at Leveranciers · Beheren.
 */
export const TRASH_KINDS: Readonly<Record<TrashKind, TrashKindRule>> = {
  ticket: { area: "support", see: 1, restore: 2, purge: 3 },
  automation: { area: "automations", see: 1, restore: 3, purge: 3 },
  sheet: { area: "data", see: 1, restore: 1, purge: 1, ownerOnly: true },
  course: { area: "courses", see: 2, restore: 3, purge: 3 },
  webhook: { area: "integrations", see: 1, restore: 2, purge: 3 },
  cost_line: { area: "analytics", see: 1, restore: 1, purge: 1, action: "costs.write" },
  supplier: { area: "suppliers", see: 1, restore: 3, purge: 3 }
}

export const TrashItem = Schema.Struct({
  id: Schema.String,
  kind: TrashKind,
  title: Schema.String,
  /** Who put it in the trash, by name; null where no audit line says. */
  deletedBy: Schema.NullOr(Schema.String),
  deletedAt: Schema.Finite,
  purgeAt: Schema.Finite
})
export type TrashItem = typeof TrashItem.Type

export const TrashList = Schema.Struct({ items: Schema.Array(TrashItem) })
export type TrashList = typeof TrashList.Type

export const TrashIds = Schema.Struct({
  ids: Schema.Array(Schema.String.check(Schema.isMaxLength(80))).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(500)
  )
})
export type TrashIds = typeof TrashIds.Type

/** What "Terugzetten" answers: the items back, and each kind's undo (spent together by "Ongedaan maken"). */
export const TrashRestored = Schema.Struct({ restored: Schema.Array(Schema.String), undo: Schema.Array(UndoTicket) })
export type TrashRestored = typeof TrashRestored.Type

export const TrashPurged = Schema.Struct({ purged: Schema.Int })
export type TrashPurged = typeof TrashPurged.Type

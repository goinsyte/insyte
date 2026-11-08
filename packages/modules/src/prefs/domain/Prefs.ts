import { Schema } from "effect"

/*
 * A member's own corner (M4.2): preferences per section, saved views, to-dos and recently opened records. Personal,
 * so never reachable by a key: the catalogue has no area for it, and its rows are the member's alone (0018).
 */

/* ── preferences ───────────────────────────────────────────────────────────────────────────────── */

/** What the console keeps per member, one row each; the console owns the shape of each value. */
export const PREF_SECTIONS = [
  "board",
  "rail",
  "panel",
  "theme",
  "topbar",
  "pins",
  "my_work",
  "regional",
  "shortcuts",
  "guides",
  "columns",
  "analytics",
  "automations_promo",
  "home"
] as const
export const PrefSection = Schema.Literals(PREF_SECTIONS)
export type PrefSection = typeof PrefSection.Type

/** A section's value as the console wrote it, and its version for the next write. */
export const PrefEntry = Schema.Struct({ value: Schema.Json, version: Schema.Int })
export type PrefEntry = typeof PrefEntry.Type

export const Recent = Schema.Struct({
  path: Schema.String,
  kind: Schema.String,
  label: Schema.String,
  at: Schema.Finite
})
export type Recent = typeof Recent.Type

/** Every section the member has written, and their recent records, newest first: the frame's first load. */
export class Prefs extends Schema.Class<Prefs>("prefs/Prefs")({
  /** By section; a section never written is absent. */
  sections: Schema.Record(Schema.String, PrefEntry),
  recents: Schema.Array(Recent)
}) {}

/** A section written over `baseVersion` (0 for one never written); a stale version is `Conflict`. */
export const PatchPref = Schema.Struct({ section: PrefSection, value: Schema.Json, baseVersion: Schema.Int })
export type PatchPref = typeof PatchPref.Type

export const RecordVisit = Schema.Struct({ path: Schema.String, kind: Schema.String, label: Schema.String })
export type RecordVisit = typeof RecordVisit.Type

/* ── saved views ───────────────────────────────────────────────────────────────────────────────── */

/** A filter rule, as `lib/filter.ts` builds it. */
export interface FilterRule {
  readonly kind: "rule"
  readonly id: string
  readonly field: string
  readonly op: string
  readonly value: ReadonlyArray<string> | string
}

/** A filter group: rules and groups joined by `and` or `or`. */
export interface FilterGroup {
  readonly kind: "group"
  readonly id: string
  readonly join: "and" | "or"
  readonly children: ReadonlyArray<FilterRule | FilterGroup>
}

const Rule = Schema.Struct({
  kind: Schema.Literal("rule"),
  id: Schema.String,
  field: Schema.String,
  op: Schema.String,
  value: Schema.Union([Schema.Array(Schema.String), Schema.String])
})

export const FilterGroup: Schema.Codec<FilterGroup> = Schema.Struct({
  kind: Schema.Literal("group"),
  id: Schema.String,
  join: Schema.Literals(["and", "or"]),
  children: Schema.Array(Schema.Union([Rule, Schema.suspend((): Schema.Codec<FilterGroup> => FilterGroup)]))
})

export class SavedView extends Schema.Class<SavedView>("prefs/SavedView")({
  id: Schema.String,
  /** The list it filters: `orders`, `tickets`, `queue`, … */
  listKey: Schema.String,
  name: Schema.String,
  filter: FilterGroup,
  pinned: Schema.Boolean,
  createdAt: Schema.Finite
}) {}

export const SaveView = Schema.Struct({ listKey: Schema.String, name: Schema.String, filter: FilterGroup })
export type SaveView = typeof SaveView.Type
export const UpdateView = Schema.Struct({ id: Schema.String, filter: FilterGroup })
export type UpdateView = typeof UpdateView.Type
export const RenameView = Schema.Struct({ id: Schema.String, name: Schema.String })
export type RenameView = typeof RenameView.Type

/** The member already has a view of that name on that list (names compare case-insensitively). */
export class ViewNameTaken extends Schema.TaggedError<ViewNameTaken>()("ViewNameTaken", { name: Schema.String }) {}

/* ── to-dos ────────────────────────────────────────────────────────────────────────────────────── */

export class Todo extends Schema.Class<Todo>("prefs/Todo")({
  id: Schema.String,
  text: Schema.String,
  done: Schema.Boolean,
  /** `YYYY-MM-DD`, or none. */
  due: Schema.NullOr(Schema.String),
  doneAt: Schema.NullOr(Schema.Finite),
  createdAt: Schema.Finite
}) {}

export const AddTodo = Schema.Struct({ text: Schema.String, due: Schema.NullOr(Schema.String) })
export type AddTodo = typeof AddTodo.Type

export const ItemRef = Schema.Struct({ id: Schema.String })

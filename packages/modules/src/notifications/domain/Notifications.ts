import { Schema } from "effect"

/*
 * In-app notifications (M5.2): what the bell, the notifications page and the settings page read. A row is a fact about
 * a record, with the actor who did it, ids and figures in `data`; the console writes the sentence. A row is in the
 * inbox, set aside until later (snoozed), or cleared.
 */

export const NoteTab = Schema.Literals(["inbox", "later", "cleared"])
export type NoteTab = typeof NoteTab.Type

export const NoteActor = Schema.Struct({
  kind: Schema.String,
  id: Schema.String,
  /** A member's name as it is now; a service or Insyte has none. */
  name: Schema.NullOr(Schema.String)
})

export class Note extends Schema.Class<Note>("notifications/Note")({
  id: Schema.String,
  kind: Schema.String,
  primary: Schema.Boolean,
  subjectType: Schema.NullOr(Schema.String),
  subjectId: Schema.NullOr(Schema.String),
  actor: Schema.NullOr(NoteActor),
  data: Schema.Json,
  createdAt: Schema.Finite,
  read: Schema.Boolean,
  state: NoteTab,
  snoozedUntil: Schema.NullOr(Schema.Finite)
}) {}

/** A page of one tab, newest first; `next` continues it. */
export class NotePage extends Schema.Class<NotePage>("notifications/NotePage")({
  items: Schema.Array(Note),
  next: Schema.NullOr(Schema.String)
}) {}

/** What the bell and the tabs count: unread in the inbox (and of them, Primair), and how many are set aside. */
export class NoteCounts extends Schema.Class<NoteCounts>("notifications/NoteCounts")({
  unread: Schema.Int,
  primaryUnread: Schema.Int,
  later: Schema.Int
}) {}

export const ListNotes = Schema.Struct({ tab: NoteTab, cursor: Schema.NullOr(Schema.String) })
export type ListNotes = typeof ListNotes.Type
export const NoteIds = Schema.Struct({ ids: Schema.Array(Schema.String) })
export const SetRead = Schema.Struct({ ids: Schema.Array(Schema.String), read: Schema.Boolean })
export type SetRead = typeof SetRead.Type
export const Snooze = Schema.Struct({ ids: Schema.Array(Schema.String), until: Schema.Finite })
export type Snooze = typeof Snooze.Type

/** The member's in-app switch per kind; a kind not listed follows the catalogue's default. */
export class NotePrefs extends Schema.Class<NotePrefs>("notifications/NotePrefs")({
  app: Schema.Record(Schema.String, Schema.Boolean)
}) {}
export const SetNotePref = Schema.Struct({ kind: Schema.String, app: Schema.Boolean })
export type SetNotePref = typeof SetNotePref.Type

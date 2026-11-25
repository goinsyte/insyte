import { mintId } from "@insyte/domain/Ids"
import type { PrincipalKind } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import type { SectionId } from "../../audit/domain/Audit.ts"
import { PendingEvents } from "../domain/Outbox.ts"
import * as Outbox from "./Outbox.ts"

/*
 * Who changed what (M1.3): one row per change, on the use case's transaction, so the change and its record commit
 * together. Append-only for the app (`audit_events` refuses update and delete to `insyte_app`). Each entry also writes
 * a `records.changed` event for the realtime sink, on the same transaction.
 */

export interface Actor {
  readonly kind: PrincipalKind
  readonly id: string
  readonly onBehalfOf?: string | undefined
}

/**
 * One changed field as the Logboek lists it: the field's id in its section's catalogue (`audit/domain/Audit.ts`), the
 * item of a list it belongs to (`key`, and `of`, what the page calls that item), and what it was and became.
 */
export interface LogChange {
  readonly field: string
  readonly key?: string | undefined
  readonly of?: string | undefined
  readonly before: unknown
  readonly after: unknown
}

/**
 * What the Logboek reads of a settings change (`diff.log`): the subject as people know it (a role's name, a key's
 * label, a webhook's address) at the time, and the fields that changed. Next to the action's own diff, which other
 * readers (the activity feed) keep reading as it was.
 */
export interface LogNote {
  readonly name?: string | undefined
  readonly changes?: ReadonlyArray<LogChange> | undefined
}

export interface AuditEntry {
  readonly action: string
  readonly subjectType: string
  readonly subjectId: string
  /**
   * The settings page's section: set, the change is in the Logboek. One of the catalogue's (`audit/domain/Audit.ts`,
   * `SECTIONS`), so a section without a page does not compile.
   */
  readonly section?: SectionId | undefined
  /** What changed, before → after, for the fields that did. Ids and values, never secrets. */
  readonly diff?: Record<string, unknown> | undefined
  readonly log?: LogNote | undefined
}

const diffOf = (entry: AuditEntry) => entry.log === undefined ? entry.diff ?? {} : { ...entry.diff, log: entry.log }

/** The fields of `before` and `after` that differ, as Logboek changes; `of` names the list item they belong to. */
export const fieldChanges = (
  before: Readonly<Record<string, unknown>>,
  after: Readonly<Record<string, unknown>>,
  fields: ReadonlyArray<string>,
  item?: { readonly key: string; readonly of?: string | undefined }
): Array<LogChange> =>
  fields.filter((f) => JSON.stringify(before[f] ?? null) !== JSON.stringify(after[f] ?? null)).map((f) => ({
    field: f,
    ...(item === undefined ? {} : { key: item.key, ...(item.of === undefined ? {} : { of: item.of }) }),
    before: before[f] ?? null,
    after: after[f] ?? null
  }))

export const write = Effect.fn("Audit.write")(
  function*(sql: SqlClient.SqlClient, workspaceId: string, actor: Actor, entry: AuditEntry) {
    yield* sql`insert into audit_events
               (id, workspace_id, actor_kind, actor_id, on_behalf_of, action, subject_type, subject_id, section, diff)
               values (${mintId("aud")}, ${workspaceId}, ${actor.kind}, ${actor.id}, ${actor.onBehalfOf ?? null},
                       ${entry.action}, ${entry.subjectType}, ${entry.subjectId}, ${entry.section ?? null},
                       ${JSON.stringify(diffOf(entry))}::jsonb)`
    // Every recorded change is also a realtime one: the workspace's open tabs refetch that kind (M5.1).
    const outboxId = yield* Outbox.write(sql, workspaceId, {
      type: "records.changed",
      workspaceId,
      kind: entry.subjectType,
      ids: [entry.subjectId]
    })
    ;(yield* PendingEvents)?.add(outboxId)
  }
)

/**
 * `write` for many entries in two statements: one insert for the rows, one `records.changed` per subject type. For a
 * bulk command whose transaction holds many row locks (a selection of 500 orders), so it holds them for less.
 */
export const writeMany = Effect.fn("Audit.writeMany")(
  function*(sql: SqlClient.SqlClient, workspaceId: string, actor: Actor, entries: ReadonlyArray<AuditEntry>) {
    if (entries.length === 0) return
    const rows = entries.map((e) => ({
      id: mintId("aud"),
      action: e.action,
      subject_type: e.subjectType,
      subject_id: e.subjectId,
      section: e.section ?? null,
      diff: diffOf(e)
    }))
    yield* sql`insert into audit_events
               (id, workspace_id, actor_kind, actor_id, on_behalf_of, action, subject_type, subject_id, section, diff)
               select r.id, ${workspaceId}, ${actor.kind}, ${actor.id}, ${actor.onBehalfOf ?? null}, r.action,
                      r.subject_type, r.subject_id, r.section, coalesce(r.diff, '{}'::jsonb)
               from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
                 as r(id text, action text, subject_type text, subject_id text, section text, diff jsonb)`
    const kinds = new Map<string, Array<string>>()
    for (const e of entries) kinds.set(e.subjectType, [...(kinds.get(e.subjectType) ?? []), e.subjectId])
    for (const [kind, ids] of kinds) {
      const outboxId = yield* Outbox.write(sql, workspaceId, { type: "records.changed", workspaceId, kind, ids })
      ;(yield* PendingEvents)?.add(outboxId)
    }
  }
)

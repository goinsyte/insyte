import { Db } from "@insyte/database/Db"
import {
  type Flow,
  MAX_STEPS,
  publishable,
  scopesRequired,
  triggerOf,
  validate
} from "@insyte/domain/automations/Graph"
import { SCOPE_IDS } from "@insyte/domain/automations/Scopes"
import { nodesOfTemplate, TEMPLATES_BY_ID } from "@insyte/domain/automations/Templates"
import { Conflict, Invalid, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { Relay } from "../../shared/domain/Outbox.ts"
import { UNDO_SECONDS } from "../../shared/domain/Undo.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import {
  AutomationChange,
  AutomationsRestore,
  type AutomationStatus,
  type CreateInput,
  DraftSaved,
  InvalidFlow,
  NothingToPublish,
  type PublishInput,
  type SaveDraftInput,
  type SetStatusInput,
  type UpdateSettingsInput
} from "../domain/Automations.ts"
import { syncAccount } from "./accounts.ts"
import { connectedBrands, detailOf, rowOf1, settingsOf } from "./read.ts"

/*
 * The automation commands (M12 step 1; api.md §2.14, widgets/05 §1). Automatiseringen · Bewerken makes, copies and
 * saves drafts; Beheren removes, pauses and changes settings; publishing, turning a flow on and granting a right take
 * the special action `automations.publish`. Each change but a draft save has one undo token (`automations.restore`).
 * Publishing pins the draft as the next immutable version; its product event waits out the undo window, and its Undo
 * goes back to the version before (a first publication goes back to a draft).
 */

export const RESTORE = "automations.restore"

/** The most a draft's steps may weigh as JSON: a canvas, not a file store. */
const MAX_DRAFT_BYTES = 256 * 1024

const audit = (sql: SqlClient.SqlClient, action: string, id: string, diff?: Record<string, unknown>) =>
  Effect.flatMap(
    Effect.service(CurrentPrincipal),
    (p) =>
      Audit.write(sql, p.workspaceId, { kind: p.kind, id: p.id }, {
        action,
        subjectType: "automation",
        subjectId: id,
        diff
      })
  )

interface Locked {
  readonly id: string
  readonly name: string
  readonly status: AutomationStatus
  readonly liveVersion: number
  readonly triggerVariant: string | null
  readonly draftJson: string
  readonly deletedAt: Date | null
}

const lock = Effect.fn("Automations.lock")(function*(sql: SqlClient.SqlClient, id: string, removed = false) {
  const [row] = yield* sql<Locked>`
    select id, name, status, live_version, trigger_variant, draft_nodes::text as draft_json, deleted_at
    from automations where id = ${id} for update`
  if (row === undefined || (row.deletedAt !== null) !== removed) {
    return yield* new NotFound({ entity: "automation", id })
  }
  return row
})

const answer = (
  sql: SqlClient.SqlClient,
  id: string | null,
  restore: AutomationsRestore | null,
  outboxIds: ReadonlyArray<string> = []
) =>
  Effect.gen(function*() {
    const undo = restore === null
      ? null
      : yield* Undo.issue(sql, { command: RESTORE, compensation: restore, outboxIds })
    return new AutomationChange({ automation: id === null ? null : yield* detailOf(sql, id), undo })
  })

const checkSize = (nodes: Flow) =>
  JSON.stringify(nodes).length > MAX_DRAFT_BYTES
    ? Effect.fail(new Invalid({ fields: { nodes: "too_large" } }))
    : Effect.void

/** The draft's steps with node ids fresh and unique, for a copy. */
const nodeId = () => mintId("node")

const freshIds = (nodes: Flow): Flow =>
  nodes.map((n) => ({
    ...n,
    id: nodeId(),
    ...(n.branches === undefined
      ? {}
      : {
        branches: {
          yes: n.branches.yes.map((l) => ({ ...l, id: nodeId() })),
          no: n.branches.no.map((l) => ({ ...l, id: nodeId() }))
        }
      })
  }))

const insert = Effect.fn("Automations.insert")(function*(
  sql: SqlClient.SqlClient,
  input: { readonly name: string; readonly description: string; readonly nodes: Flow; readonly template: string | null }
) {
  const principal = yield* CurrentPrincipal
  const id = mintId("auto")
  const owner = principal.kind === "member" ? principal.id : null
  yield* sql`
    insert into automations (id, workspace_id, name, description, owner_member_id, draft_nodes, template, created_by)
    values (${id}, ${principal.workspaceId}, ${input.name}, ${input.description}, ${owner},
            ${JSON.stringify(input.nodes)}::jsonb, ${input.template}, ${principal.id})`
  yield* sql`insert into automation_settings (workspace_id, automation_id) values (${principal.workspaceId}, ${id})`
  return id
})

export const UNTITLED = "Naamloze automatisering"

/** "Nieuwe automatisering", or "Gebruiken" on a template: a draft, which runs nothing until it is published. */
export const create = Effect.fn("Automations.create")(function*(input: typeof CreateInput.Type) {
  yield* Policy.require("automations", 2)
  const template = input.templateId === undefined ? undefined : TEMPLATES_BY_ID[input.templateId]
  if (input.templateId !== undefined && template === undefined) {
    return yield* new NotFound({ entity: "automation_template", id: input.templateId })
  }
  const nodes = template === undefined ? (input.nodes ?? []) : nodesOfTemplate(template, () => mintId("node"))
  yield* checkSize(nodes)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const id = yield* insert(sql, {
        name: input.name?.trim() || template?.name || UNTITLED,
        description: input.description ?? template?.description ?? "",
        nodes,
        template: template?.id ?? null
      })
      yield* audit(sql, "automation.created", id, { template: template?.id ?? null })
      return yield* answer(sql, id, { kind: "created", id })
    })
  )
})

/**
 * The canvas as it stands, kept without publishing (widgets/05 §1.4): it answers what is wrong per step, and refuses
 * nothing but a draft too big to keep. It has no undo of its own: the canvas's own Undo, or Terugzetten, puts back.
 */
export const saveDraft = Effect.fn("Automations.saveDraft")(function*(input: typeof SaveDraftInput.Type) {
  yield* Policy.require("automations", 2)
  yield* checkSize(input.nodes)
  if (input.name !== undefined && input.name.trim() === "") return yield* new Invalid({ fields: { name: "required" } })
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* lock(sql, input.id)
      const [saved] = yield* sql<{ draftSavedAt: Date }>`
        update automations set draft_nodes = ${JSON.stringify(input.nodes)}::jsonb, draft_saved_at = now(),
                               name = coalesce(${input.name?.trim() ?? null}, name),
                               description = coalesce(${input.description ?? null}, description)
        where id = ${input.id} returning draft_saved_at`
      const settings = yield* settingsOf(sql, input.id)
      const connected = new Set(yield* connectedBrands(sql))
      const { row } = yield* rowOf1(sql, input.id)
      return new DraftSaved({
        savedAt: saved!.draftSavedAt.getTime(),
        issues: validate(input.nodes, { scopesOff: settings.scopesOff, connected, selfId: input.id }),
        automation: row
      })
    })
  )
})

/** "Dupliceren": a draft with the same steps, settings and words, "(kopie)" after its name. */
export const duplicate = Effect.fn("Automations.duplicate")(function*(id: string) {
  yield* Policy.require("automations", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const from = yield* lock(sql, id)
      const [d] = yield* sql<{ description: string }>`select description from automations where id = ${id}`
      const name = `${from.name} (kopie)`.slice(0, 120)
      const copy = yield* insert(sql, {
        name,
        description: d?.description ?? "",
        nodes: freshIds(JSON.parse(from.draftJson) as Flow),
        template: null
      })
      yield* sql`
        update automation_settings t set scopes_off = s.scopes_off, scopes_extra = s.scopes_extra,
                                         notify_member_id = s.notify_member_id,
                                         rate_limit_per_hour = s.rate_limit_per_hour
        from automation_settings s where s.automation_id = ${id} and t.automation_id = ${copy}`
      yield* audit(sql, "automation.created", copy, { duplicateOf: id })
      return yield* answer(sql, copy, { kind: "created", id: copy })
    })
  )
})

/** "Verwijderen": the flow stops and leaves the list; Undo brings it back as it was. */
export const remove = Effect.fn("Automations.remove")(function*(id: string) {
  yield* Policy.require("automations", 3)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* lock(sql, id)
      yield* sql`update automations set deleted_at = now() where id = ${id}`
      yield* syncAccount(sql, id)
      yield* audit(sql, "automation.removed", id)
      return yield* answer(sql, null, { kind: "removed", id })
    })
  )
})

/** "Terugzetten" on a removed flow: back in the list as it was. The toast's Undo does the same by its token. */
export const restoreRemoved = Effect.fn("Automations.restoreRemoved")(function*(id: string) {
  yield* Policy.require("automations", 3)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* lock(sql, id, true)
      yield* sql`update automations set deleted_at = null where id = ${id}`
      yield* syncAccount(sql, id)
      yield* audit(sql, "automation.restored", id)
      return yield* answer(sql, id, null)
    })
  )
})

/**
 * "Publiceren": the draft as the next version, with its note, if it can run (`validate`'s errors refuse it) and differs
 * from the live one. A draft's first publication turns it on; a paused flow stays paused on its new version.
 */
export const publish = Effect.fn("Automations.publish")(function*(input: typeof PublishInput.Type) {
  yield* Policy.require("automations", 2)
  yield* Policy.requireAction("automations.publish")
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  const { change, outboxIds } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const a = yield* lock(sql, input.id)
      const nodes = JSON.parse(a.draftJson) as Flow
      if (a.liveVersion > 0) {
        const [live] = yield* sql<{ nodesJson: string }>`
          select nodes::text as nodes_json from automation_versions
          where automation_id = ${a.id} and version = ${a.liveVersion}`
        if (live !== undefined && JSON.stringify(JSON.parse(live.nodesJson)) === JSON.stringify(nodes)) {
          return yield* new NothingToPublish({ version: a.liveVersion })
        }
      }
      const settings = yield* settingsOf(sql, a.id)
      const issues = validate(nodes, {
        scopesOff: settings.scopesOff,
        connected: new Set(yield* connectedBrands(sql)),
        selfId: a.id
      })
      if (!publishable(issues)) return yield* new InvalidFlow({ issues: issues.filter((i) => i.severity === "error") })
      const version = a.liveVersion + 1
      const trigger = triggerOf(nodes)!.variantId
      yield* sql`
        insert into automation_versions (workspace_id, automation_id, version, nodes, note, scopes_required,
                                         published_by)
        values (${principal.workspaceId}, ${a.id}, ${version}, ${a.draftJson}::jsonb,
                ${input.note.trim() || "Gepubliceerd"}, ${[...scopesRequired(nodes)]}::text[], ${principal.id})`
      const status: AutomationStatus = a.status === "draft" ? "active" : a.status
      yield* sql`update automations set live_version = ${version}, status = ${status}, trigger_variant = ${trigger}
                 where id = ${a.id}`
      yield* syncAccount(sql, a.id, { renew: true })
      yield* audit(sql, "automation.published", a.id, { version, note: input.note, from: a.status, to: status })
      const outboxId = yield* Outbox.write(sql, principal.workspaceId, {
        type: "automation.published",
        workspaceId: principal.workspaceId,
        userId: principal.userId ?? "system",
        automationId: a.id,
        version,
        trigger,
        steps: Math.min(MAX_STEPS, nodes.length)
      }, { afterSeconds: UNDO_SECONDS })
      const restore: AutomationsRestore = {
        kind: "published",
        id: a.id,
        version,
        status: a.status,
        liveVersion: a.liveVersion,
        triggerVariant: a.triggerVariant
      }
      return { change: yield* answer(sql, a.id, restore, [outboxId]), outboxIds: [outboxId] }
    })
  )
  yield* Effect.flatMap(Effect.service(Relay), (relay) => relay.kick(outboxIds, { afterSeconds: UNDO_SECONDS }))
  return change
})

/**
 * "Aan" / "Pauzeren": a flow with a live version runs it or stops. Pausing takes Beheren; turning on is publishing's
 * right. A draft has nothing to turn on: it is published first.
 */
export const setStatus = Effect.fn("Automations.setStatus")(function*(input: typeof SetStatusInput.Type) {
  if (input.status === "active") yield* Policy.requireAction("automations.publish")
  else yield* Policy.require("automations", 3)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const a = yield* lock(sql, input.id)
      if (a.liveVersion === 0) return yield* new Conflict({ entity: "automation", reason: "not_published" })
      if (a.status === input.status) return yield* answer(sql, a.id, null)
      yield* sql`update automations set status = ${input.status} where id = ${a.id}`
      yield* syncAccount(sql, a.id)
      yield* audit(sql, "automation.status_changed", a.id, { from: a.status, to: input.status })
      return yield* answer(sql, a.id, { kind: "status", id: a.id, status: a.status })
    })
  )
})

/**
 * Instellingen: the rights, who hears of a failed run, and the rate. Beheren changes them; granting a right (switching
 * one on, or adding one no step needs) is publishing's right, as it widens what the flow may do.
 */
export const updateSettings = Effect.fn("Automations.updateSettings")(function*(
  input: typeof UpdateSettingsInput.Type
) {
  yield* Policy.require("automations", 3)
  const unknown = [...(input.scopesOff ?? []), ...(input.scopesExtra ?? [])].find((s) => !SCOPE_IDS.includes(s))
  if (unknown !== undefined) return yield* new Invalid({ fields: { scopes: "unknown_scope" } })
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const a = yield* lock(sql, input.id)
      const [was] = yield* sql<{
        scopesOff: Array<string>
        scopesExtra: Array<string>
        notifyMemberId: string | null
        rateLimitPerHour: number
      }>`select scopes_off, scopes_extra, notify_member_id, rate_limit_per_hour
         from automation_settings where automation_id = ${a.id} for update`
      const before = {
        scopesOff: was?.scopesOff ?? [],
        scopesExtra: was?.scopesExtra ?? [],
        notifyMemberId: was?.notifyMemberId ?? null,
        rateLimit: was?.rateLimitPerHour ?? 0
      }
      const next = {
        scopesOff: [...new Set(input.scopesOff ?? before.scopesOff)],
        scopesExtra: [...new Set(input.scopesExtra ?? before.scopesExtra)],
        notifyMemberId: input.notifyMemberId === undefined ? before.notifyMemberId : input.notifyMemberId,
        rateLimit: input.rateLimit ?? before.rateLimit
      }
      const grants = before.scopesOff.some((s) => !next.scopesOff.includes(s)) ||
        next.scopesExtra.some((s) => !before.scopesExtra.includes(s))
      if (grants) yield* Policy.requireAction("automations.publish")
      if (next.notifyMemberId !== null) {
        const [m] = yield* sql<{ id: string }>`
          select id from members where id = ${next.notifyMemberId} and deactivated_at is null and removed_at is null`
        if (m === undefined) return yield* new Invalid({ fields: { notifyMemberId: "not_a_member" } })
      }
      yield* sql`
        insert into automation_settings (workspace_id, automation_id, scopes_off, scopes_extra, notify_member_id,
                                         rate_limit_per_hour)
        values ((select workspace_id from automations where id = ${a.id}), ${a.id}, ${next.scopesOff}::text[],
                ${next.scopesExtra}::text[], ${next.notifyMemberId}, ${next.rateLimit})
        on conflict (automation_id) do update set scopes_off = excluded.scopes_off,
          scopes_extra = excluded.scopes_extra, notify_member_id = excluded.notify_member_id,
          rate_limit_per_hour = excluded.rate_limit_per_hour`
      yield* syncAccount(sql, a.id)
      yield* audit(sql, "automation.settings_changed", a.id, { before, after: next })
      return yield* answer(sql, a.id, { kind: "settings", id: a.id, settings: before })
    })
  )
})

const decodeRestore = Schema.decodeUnknownEffect(AutomationsRestore)

/** `automations.restore`: what the toast's "Ongedaan maken" puts back. */
export const restore = Effect.fn("Automations.restore")(function*(sql: SqlClient.SqlClient, compensation: unknown) {
  const undo = yield* decodeRestore(compensation).pipe(Effect.orDie)
  yield* undoOf(sql, undo)
  // The flow's account follows what the undo put back (M12 step 2).
  if (undo.kind !== "created") yield* syncAccount(sql, undo.id)
})

const undoOf = Effect.fn("Automations.undoOf")(function*(sql: SqlClient.SqlClient, undo: AutomationsRestore) {
  const principal = yield* CurrentPrincipal
  switch (undo.kind) {
    case "created": {
      yield* Policy.require("automations", 2)
      yield* sql`delete from automations where id = ${undo.id}`
      yield* audit(sql, "automation.removed", undo.id)
      return
    }
    case "removed": {
      yield* Policy.require("automations", 3)
      yield* sql`update automations set deleted_at = null where id = ${undo.id}`
      yield* audit(sql, "automation.restored", undo.id)
      return
    }
    case "published": {
      yield* Policy.requireAction("automations.publish")
      const [a] = yield* sql<{ liveVersion: number }>`
        select live_version from automations where id = ${undo.id} for update`
      // Something published since: that is what runs now, and this undo has nothing left to take back.
      if (a === undefined || a.liveVersion !== undo.version) {
        return yield* new Conflict({ entity: "automation", reason: "published_since" })
      }
      if (undo.liveVersion === 0) {
        yield* sql`update automations set live_version = 0, status = 'draft', trigger_variant = null
                   where id = ${undo.id}`
        yield* sql`delete from automation_versions where automation_id = ${undo.id} and version = ${undo.version}`
      } else {
        // A version is never rewritten (M12): the one before comes back as the next.
        const version = undo.version + 1
        yield* sql`
          insert into automation_versions (workspace_id, automation_id, version, nodes, note, scopes_required,
                                           published_by)
          select workspace_id, automation_id, ${version}, nodes, ${`Terug naar versie ${undo.liveVersion}`},
                 scopes_required, ${principal.id}
          from automation_versions where automation_id = ${undo.id} and version = ${undo.liveVersion}`
        yield* sql`update automations set live_version = ${version}, status = ${undo.status},
                     trigger_variant = ${undo.triggerVariant}
                   where id = ${undo.id}`
      }
      yield* audit(sql, "automation.publish_undone", undo.id, { version: undo.version })
      return
    }
    case "status": {
      yield* undo.status === "active" ? Policy.requireAction("automations.publish") : Policy.require("automations", 3)
      yield* sql`update automations set status = ${undo.status} where id = ${undo.id} and live_version > 0`
      yield* audit(sql, "automation.status_changed", undo.id, { to: undo.status, undone: true })
      return
    }
    case "settings": {
      yield* Policy.require("automations", 3)
      const s = undo.settings
      yield* sql`update automation_settings set scopes_off = ${s.scopesOff}::text[],
                   scopes_extra = ${s.scopesExtra}::text[], notify_member_id = ${s.notifyMemberId},
                   rate_limit_per_hour = ${s.rateLimit}
                 where automation_id = ${undo.id}`
      yield* audit(sql, "automation.settings_changed", undo.id, { undone: true })
      return
    }
  }
})

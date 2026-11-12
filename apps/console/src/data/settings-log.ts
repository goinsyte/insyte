import { Forbidden, Invalid, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { AuditFacets, AuditPage } from "@insyte/modules/audit/domain/Audit"
import { TrashList } from "@insyte/modules/trash/domain/Trash"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"
import { TICKETS } from "./tickets.ts"
import { WORKSPACE } from "./workspace.ts"

/*
 * Instellingen → Logboek and Prullenbak (M17 step 20.1a): the log's lines per filter and its people and pages, and the
 * trash, each primed by its route's loader for the first view and carried in the document. A settings save names
 * `WORKSPACE`, so the log reads it again; a ticket set aside or put back names `TICKETS`, so the trash does.
 */

const AUDIT = ["audit"] as const
export const TRASH = ["trash"] as const

const errors = Schema.Union([Forbidden, Invalid, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])
/** A read that takes no input cannot be invalid. */
const readErrors = Schema.Union([Forbidden, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])

/** The log's filter as the server takes it; `key` is its atom's. */
export interface LogQuery {
  readonly days: 7 | 30 | null
  readonly actor: string
  readonly page: string
}

export const logKey = (q: LogQuery) => `${q.days ?? "all"}|${q.actor}|${q.page}`

export const logPayload = (q: LogQuery) => ({
  category: "settings" as const,
  ...(q.days === null ? {} : { days: q.days }),
  ...(q.actor === "" ? {} : { actor: q.actor }),
  ...(q.page === "" ? {} : { page: q.page })
})

const queryOf = (q: LogQuery) =>
  ConsoleClient.query("Audit.list", logPayload(q), { reactivityKeys: [...AUDIT, ...WORKSPACE] })

/** The first view's: the last 30 days, everyone, every page, primed by the loader. */
export const FIRST_LOG: LogQuery = { days: 30, actor: "", page: "" }

export const firstLogAtom = Atom.serializable(queryOf(FIRST_LOG), {
  key: "audit-first",
  schema: AsyncResult.Schema({ success: AuditPage, error: errors }),
  skipInitialRun: true
})

/** Any other filter's, read in the browser when it is picked. */
export const logAtom = Atom.family((key: string) => {
  const [days, actor = "", page = ""] = key.split("|")
  return queryOf({ days: days === "7" ? 7 : days === "30" ? 30 : null, actor, page })
})

export const logFacetsAtom = Atom.serializable(
  ConsoleClient.query("Audit.facets", undefined, { reactivityKeys: [...AUDIT, ...WORKSPACE] }),
  { key: "audit-facets", schema: AsyncResult.Schema({ success: AuditFacets, error: readErrors }), skipInitialRun: true }
)

export const trashAtom = Atom.serializable(
  ConsoleClient.query("Trash.list", undefined, { reactivityKeys: [...TRASH, ...TICKETS] }),
  { key: "trash", schema: AsyncResult.Schema({ success: TrashList, error: readErrors }), skipInitialRun: true }
)

export const logWrites = {
  /** A page further back, for "Meer laden": read, not changed. */
  more: ConsoleClient.mutation("Audit.list"),
  exportCsv: ConsoleClient.mutation("Audit.export")
} as const

export const trashWrites = {
  restore: ConsoleClient.mutation("Trash.restore"),
  purge: ConsoleClient.mutation("Trash.purge"),
  empty: ConsoleClient.mutation("Trash.empty"),
  undo: ConsoleClient.mutation("Shared.undo")
} as const

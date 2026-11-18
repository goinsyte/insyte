import { Db } from "@insyte/database/Db"
import { Invalid } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import { SqlError, type Statement } from "effect/sql"
import { brokenText, decodeCursor, encodeCursor, validDate } from "../../shared/tables/FilterSql.ts"
import type { Folder, ThreadRow } from "../domain/Inbox.ts"
import { fenced, folderCondition, matching, type Row, SELECT, THREADS, toRow } from "./threads.ts"

/*
 * The inbox a page at a time (M19.2, M19.3): what `/v1/threads` and `list_threads` read, at Klantenservice · Bekijken,
 * fenced as the console's list is (`fenced`: every mail, a mailbox being no store's, and the chats of the principal's
 * stores). Newest first, by a keyset cursor on the last message's exact time and the thread's id, with the total that
 * matches. Loaded with the first page a Worker serves (ADR-0041 §3): the console never reads it.
 */

export interface PageInput {
  readonly folder?: Folder | undefined
  /** A mailbox's id, or a website chat channel's. */
  readonly mailboxId?: string | undefined
  readonly channel?: "email" | "webchat" | undefined
  /** One store's chats: mail is no store's, so a store's page has none. Outside the principal's stores: nothing. */
  readonly storeId?: string | undefined
  readonly q?: string | undefined
  readonly cursor?: string | undefined
  /** 1–200; 50 when absent. */
  readonly limit?: number | undefined
}

export interface ThreadPage {
  readonly rows: ReadonlyArray<ThreadRow>
  readonly nextCursor: string | null
  readonly total: number
}

const LIMIT = 50
/** The first input Postgres could not take as text (a NUL, a lone surrogate): refused by its field, not a 500. */
const broken = (input: PageInput) =>
  (["folder", "mailboxId", "channel", "storeId", "q"] as const).find((f) => {
    const v = input[f]
    return v !== undefined && brokenText(v)
  })

export const page = Effect.fn("Threads.page")(function*(input: PageInput) {
  yield* Policy.require("support", 1)
  const principal = yield* CurrentPrincipal
  const bad = broken(input)
  if (bad !== undefined) return yield* new Invalid({ fields: { [bad]: "invalid" } })
  const key = yield* decodeCursor(input.cursor).pipe(
    Effect.mapError(() => new Invalid({ fields: { cursor: "invalid" } }))
  )
  // The cursor is the last row's time as Postgres wrote it (to the microsecond) and its id.
  if (
    key !== undefined &&
    (key.length !== 2 || typeof key[0] !== "string" || key[0].includes("infinity") || !validDate(key[0]) ||
      typeof key[1] !== "string" ||
      key[1].length > 64 || brokenText(key[1]))
  ) {
    return yield* new Invalid({ fields: { cursor: "invalid" } })
  }
  const after = key as readonly [string, string] | undefined
  const limit = Math.min(200, Math.max(1, Math.floor(input.limit ?? LIMIT)))
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const where: Array<Statement.Fragment> = [yield* fenced(sql)]
      if (input.folder !== undefined) where.push(folderCondition(sql, input.folder, principal.id))
      if (input.mailboxId !== undefined) where.push(sql`t.mailbox_id = ${input.mailboxId}`)
      if (input.channel !== undefined) {
        where.push(input.channel === "email" ? sql`t.channel is null` : sql`t.channel = ${input.channel}`)
      }
      if (input.storeId !== undefined) where.push(sql`t.store_id = ${input.storeId}`)
      const q = input.q?.trim() ?? ""
      if (q !== "") where.push(matching(sql, q.slice(0, 200)))
      const before = after === undefined
        ? sql`true`
        : sql`(t.last_message_at, t.id) < (${after[0]}::timestamptz, ${after[1]})`
      const rows = yield* sql<Row & { readonly at: string }>`
        select ${sql.literal(SELECT)}, t.last_message_at::text as at from ${sql.literal(THREADS)}
        where ${sql.and([...where, before])}
        order by t.last_message_at desc, t.id desc limit ${limit + 1}`
      const [count] = yield* sql<{ n: number }>`
        select count(*)::int as n from ${sql.literal(THREADS)} where ${sql.and(where)}`
      const shown = rows.slice(0, limit)
      const last = shown.at(-1)
      return {
        rows: shown.map(toRow),
        nextCursor: rows.length > limit && last !== undefined ? encodeCursor([last.at, last.id]) : null,
        total: count?.n ?? 0
      } satisfies ThreadPage
    })
  ).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
})

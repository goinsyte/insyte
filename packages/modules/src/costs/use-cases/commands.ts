import { Db } from "@insyte/database/Db"
import { Invalid, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import {
  CostChange,
  type CostKind,
  type CostSource,
  CostsRestore,
  type CreateInput,
  KindChangeNotAllowed,
  type Month,
  MonthOutOfRange,
  NotEditable,
  type SetAmountInput,
  type UpdateInput
} from "../domain/Costs.ts"
import { addMonths, monthsBetween } from "../domain/Figures.ts"
import { workspaceMonth } from "./costs.ts"

/*
 * Kosten's commands (M13 step 5; widgets/02 `/costs` Actions): Analyse · Bekijken and the `costs.write` special
 * ("Kosten bewerken"). Each applies at once and answers one undo token (`costs.restore`) that puts the line and its
 * typed months back as they were, or takes a new line away again. Every change is audited, and so tells the
 * workspace's open tabs (`records.changed{cost_line}`). Nothing leaves Insyte, so nothing waits in the outbox.
 */

export const RESTORE = "costs.restore"

/** Typed months go back three years at most, and never past the current one. */
const MONTHS_BACK = 36

const require = Effect.gen(function*() {
  yield* Policy.require("analytics", 1)
  yield* Policy.requireAction("costs.write")
})

interface Locked {
  readonly id: string
  readonly name: string
  readonly kind: CostKind
  readonly rate: number | null
  readonly rateMinor: string | null
  readonly source: CostSource
  readonly deletedAt: Date | null
}

const lock = Effect.fn("Costs.lock")(function*(sql: SqlClient.SqlClient, id: string, withDeleted = false) {
  const [row] = yield* sql<Locked>`
    select id, name, kind, rate::float8 as rate, rate_minor::text as rate_minor, source, deleted_at
    from cost_lines where id = ${id} and (${withDeleted} or deleted_at is null) for update`
  if (row === undefined) return yield* new NotFound({ entity: "cost_line", id })
  return row
})

const amountsOf = (sql: SqlClient.SqlClient, id: string) =>
  Effect.map(
    sql<{ month: string; amountMinor: string }>`
      select to_char(month, 'YYYY-MM') as month, amount_minor::text as amount_minor
      from cost_line_amounts where line_id = ${id} order by month`,
    (rows) => rows.map((r) => ({ month: r.month as Month, amountMinor: Number(r.amountMinor) }))
  )

/** The line and its typed months as they are now, for its undo. */
const snapshot = (sql: SqlClient.SqlClient, l: Locked) =>
  Effect.map(amountsOf(sql, l.id), (amounts): CostsRestore => ({
    kind: "line",
    line: {
      id: l.id,
      name: l.name,
      kind: l.kind,
      rate: l.rate === null ? null : Number(l.rate),
      rateMinor: l.rateMinor === null ? null : Number(l.rateMinor),
      source: l.source,
      deletedAt: l.deletedAt?.getTime() ?? null
    },
    amounts
  }))

const audit = (sql: SqlClient.SqlClient, action: string, id: string, diff?: Record<string, unknown>) =>
  Effect.flatMap(
    Effect.service(CurrentPrincipal),
    (p) =>
      Audit.write(sql, p.workspaceId, { kind: p.kind, id: p.id }, {
        action,
        subjectType: "cost_line",
        subjectId: id,
        diff
      })
  )

const answer = (sql: SqlClient.SqlClient, id: string, restore: CostsRestore) =>
  Effect.map(Undo.issue(sql, { command: RESTORE, compensation: restore }), (undo) => new CostChange({ id, undo }))

/** The rule a kind needs, checked as the form shows it: `rate` is both the percentage and the amount per order. */
const ruleOf = (input: {
  readonly kind: CostKind
  readonly rate?: number | undefined
  readonly rateMinor?: number | undefined
  readonly source?: CostSource | undefined
}) => {
  const fields: Record<string, string> = {}
  let rate: number | null = null
  let rateMinor: number | null = null
  if (input.kind === "percent") {
    if (input.rate === undefined) fields["rate"] = "required"
    else if (input.rate < 0 || input.rate > 100) fields["rate"] = "range"
    else rate = Math.round(input.rate * 10_000) / 10_000
  }
  if (input.kind === "per_order") {
    if (input.rateMinor === undefined) fields["rate"] = "required"
    else if (input.rateMinor < 0) fields["rate"] = "negative"
    else rateMinor = input.rateMinor
  }
  const source: CostSource = input.kind === "ads" ? (input.source ?? "manual") : "manual"
  return { fields, rate, rateMinor, source }
}

const nameOf = (raw: string, fields: Record<string, string>) => {
  const name = raw.trim()
  if (name === "") fields["name"] = "required"
  else if (name.length > 80) fields["name"] = "too_long"
  return name
}

/** A month inside what may be typed: not after the current one, not more than three years back. */
const inRange = (month: string, current: Month) =>
  month <= current && month >= addMonths(current, -MONTHS_BACK)
    ? Effect.void
    : Effect.fail(new MonthOutOfRange({ month }))

/** "Kostenpost toevoegen": at the end of its group, with the same amount in every month of the list where one is typed. */
export const create = Effect.fn("Costs.create")(function*(input: typeof CreateInput.Type) {
  yield* require
  const fields: Record<string, string> = {}
  const name = nameOf(input.name, fields)
  const rule = ruleOf(input)
  Object.assign(fields, rule.fields)
  const typed = input.kind === "fixed" || input.kind === "ads"
  const amount = typed ? input.amountPerMonthMinor : undefined
  if (amount !== undefined && amount < 0) fields["amount"] = "negative"
  if (Object.keys(fields).length > 0) return yield* new Invalid({ fields })
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const { currency, current } = yield* workspaceMonth(sql)
      const months = amount === undefined
        ? []
        : [...new Set(input.months ?? monthsBetween(addMonths(current, -4), current))]
      for (const m of months) yield* inRange(m, current)
      const [last] = yield* sql<{ p: number }>`
        select coalesce(max(position), -1)::int + 1 as p from cost_lines where deleted_at is null`
      const id = mintId("cost")
      yield* sql`
        insert into cost_lines (id, workspace_id, name, kind, rate, rate_minor, currency, source, position, created_by)
        values (${id}, ${principal.workspaceId}, ${name}, ${input.kind}, ${rule.rate}, ${rule.rateMinor}, ${currency},
                ${rule.source}, ${last?.p ?? 0}, ${principal.id})`
      for (const m of months) {
        yield* sql`
          insert into cost_line_amounts (line_id, workspace_id, month, amount_minor, currency, typed_by)
          values (${id}, ${principal.workspaceId}, ${`${m}-01`}::date, ${amount!}, ${currency}, ${principal.id})`
      }
      yield* audit(sql, "cost_line.created", id, {
        name,
        kind: input.kind,
        rate: rule.rate,
        rateMinor: rule.rateMinor,
        source: rule.source,
        months: months.length
      })
      return yield* answer(sql, id, { kind: "created", id })
    })
  )
})

/** "Opslaan": the name, kind and rule. A line with typed months keeps them, so it cannot become a worked-out kind. */
export const update = Effect.fn("Costs.update")(function*(input: typeof UpdateInput.Type) {
  yield* require
  const fields: Record<string, string> = {}
  const name = nameOf(input.name, fields)
  const rule = ruleOf(input)
  Object.assign(fields, rule.fields)
  if (Object.keys(fields).length > 0) return yield* new Invalid({ fields })
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const l = yield* lock(sql, input.id)
      const before = yield* snapshot(sql, l)
      const worked = input.kind === "percent" || input.kind === "per_order"
      if (worked && input.kind !== l.kind && before.kind === "line" && before.amounts.length > 0) {
        return yield* new KindChangeNotAllowed({ lineId: l.id })
      }
      // An ad line keeps its account unless it is told another.
      const source = input.kind === "ads" ? (input.source ?? (l.kind === "ads" ? l.source : "manual")) : "manual"
      const same = name === l.name && input.kind === l.kind &&
        rule.rate === (l.rate === null ? null : Number(l.rate)) &&
        rule.rateMinor === (l.rateMinor === null ? null : Number(l.rateMinor)) && source === l.source
      if (same) return new CostChange({ id: l.id, undo: null })
      yield* sql`
        update cost_lines set name = ${name}, kind = ${input.kind}, rate = ${rule.rate}, rate_minor = ${rule.rateMinor},
                              source = ${source}, connection_id = case when ${source} = source then connection_id end
        where id = ${l.id}`
      yield* audit(sql, "cost_line.updated", l.id, {
        name: [l.name, name],
        kind: [l.kind, input.kind],
        rate: [l.rate, rule.rate],
        rateMinor: [l.rateMinor === null ? null : Number(l.rateMinor), rule.rateMinor],
        source: [l.source, source]
      })
      return yield* answer(sql, l.id, before)
    })
  )
})

/** A month typed in place, or cleared (`null`). Unchanged is a no-op with no undo. */
export const setAmount = Effect.fn("Costs.setAmount")(function*(input: typeof SetAmountInput.Type) {
  yield* require
  if (input.amountMinor !== null && input.amountMinor < 0) {
    return yield* new Invalid({ fields: { amount: "negative" } })
  }
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const l = yield* lock(sql, input.lineId)
      if (l.kind === "percent" || l.kind === "per_order") {
        return yield* new NotEditable({ lineId: l.id, kind: l.kind })
      }
      const { currency, current } = yield* workspaceMonth(sql)
      yield* inRange(input.month, current)
      const before = yield* snapshot(sql, l)
      const prior = before.kind === "line" ? before.amounts.find((a) => a.month === input.month) : undefined
      if ((prior?.amountMinor ?? null) === input.amountMinor) return new CostChange({ id: l.id, undo: null })
      const month = `${input.month}-01`
      if (input.amountMinor === null) {
        yield* sql`delete from cost_line_amounts where line_id = ${l.id} and month = ${month}::date`
      } else {
        yield* sql`
          insert into cost_line_amounts (line_id, workspace_id, month, amount_minor, currency, typed_by)
          values (${l.id}, ${principal.workspaceId}, ${month}::date, ${input.amountMinor}, ${currency}, ${principal.id})
          on conflict (line_id, month) do update
            set amount_minor = excluded.amount_minor, currency = excluded.currency, typed_by = excluded.typed_by,
                typed_at = now()`
      }
      yield* audit(sql, "cost_line.amount_set", l.id, {
        month: input.month,
        amountMinor: [prior?.amountMinor ?? null, input.amountMinor]
      })
      return yield* answer(sql, l.id, before)
    })
  )
})

/** "Weer uit ‹bron› lezen": an ad line's typed months dropped, so it reads from its account again. */
export const readFromSource = Effect.fn("Costs.readFromSource")(function*(id: string) {
  yield* require
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const l = yield* lock(sql, id)
      if (l.kind !== "ads" || l.source === "manual") return yield* new NotEditable({ lineId: l.id, kind: l.kind })
      const before = yield* snapshot(sql, l)
      if (before.kind === "line" && before.amounts.length === 0) return new CostChange({ id: l.id, undo: null })
      yield* sql`delete from cost_line_amounts where line_id = ${l.id}`
      yield* audit(sql, "cost_line.read_from_source", l.id, { source: l.source })
      return yield* answer(sql, l.id, before)
    })
  )
})

/** "Verwijderen": set aside with its months, so the undo brings both back. */
export const remove = Effect.fn("Costs.remove")(function*(id: string) {
  yield* require
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const l = yield* lock(sql, id)
      const before = yield* snapshot(sql, l)
      yield* sql`update cost_lines set deleted_at = now() where id = ${l.id}`
      yield* audit(sql, "cost_line.removed", l.id, { name: l.name })
      return yield* answer(sql, l.id, before)
    })
  )
})

const decodeRestore = Schema.decodeUnknownEffect(CostsRestore)

/** `Shared.undo`'s compensation: a new line taken away again, or a line and its typed months as they were. */
export const restore = Effect.fn("Costs.restore")(function*(sql: SqlClient.SqlClient, compensation: unknown) {
  const undo = yield* decodeRestore(compensation).pipe(Effect.orDie)
  yield* require
  const principal = yield* CurrentPrincipal
  if (undo.kind === "created") {
    yield* sql`delete from cost_lines where id = ${undo.id}`
    yield* audit(sql, "cost_line.removed", undo.id)
    return
  }
  const l = undo.line
  const [row] = yield* sql<{ currency: string }>`select currency from cost_lines where id = ${l.id} for update`
  if (row === undefined) return yield* new NotFound({ entity: "cost_line", id: l.id })
  yield* sql`
    update cost_lines set name = ${l.name}, kind = ${l.kind}, rate = ${l.rate}, rate_minor = ${l.rateMinor},
                          source = ${l.source}, deleted_at = ${l.deletedAt === null ? null : new Date(l.deletedAt)}
    where id = ${l.id}`
  yield* sql`delete from cost_line_amounts where line_id = ${l.id}`
  for (const a of undo.amounts) {
    yield* sql`
      insert into cost_line_amounts (line_id, workspace_id, month, amount_minor, currency, typed_by)
      values (${l.id}, ${principal.workspaceId}, ${`${a.month}-01`}::date, ${a.amountMinor}, ${row.currency},
              ${principal.id})`
  }
  yield* audit(sql, "cost_line.restored", l.id)
})

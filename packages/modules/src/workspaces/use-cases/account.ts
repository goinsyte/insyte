import { Db } from "@insyte/database/Db"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { type RetentionDays, WorkspaceAccount } from "../domain/Settings.ts"

/*
 * Instellingen → Account, read (M3.1; widgets/05 §2.1): the workspace's facts, its alert thresholds and how long a
 * closed store stays readable, from its own row. Reading takes Instellingen · Bekijken (M03: `settings/profile` is
 * `settings≥1`).
 */

/** The account as the row has it, on the caller's transaction (the writes answer with it too). */
export const load = Effect.fn("Workspaces.loadAccount")(function*(sql: SqlClient.SqlClient, workspaceId: string) {
  // The thresholds by key: the SQL client camelCases a jsonb value's keys.
  const [row] = yield* sql<{
    name: string
    legalEntity: string | null
    vatNumber: string | null
    billingEmail: string | null
    country: string
    currency: string
    retentionDays: number
    delayHours: number
    disputeAmountMinor: string
  }>`
    select name, legal_entity, vat_number, billing_email, country, currency, retention_days,
           coalesce((alerts->>'delay_hours')::int, 48) as delay_hours,
           coalesce((alerts->>'dispute_amount_minor')::bigint, 10000) as dispute_amount_minor
    from workspaces where id = ${workspaceId}`
  if (row === undefined) return yield* Effect.die(`no workspace ${workspaceId}`)
  return new WorkspaceAccount({
    name: row.name,
    legalEntity: row.legalEntity ?? "",
    vatNumber: row.vatNumber ?? "",
    billingEmail: row.billingEmail ?? "",
    country: row.country.trim(),
    currency: row.currency.trim(),
    alerts: { delayHours: row.delayHours, disputeAmountMinor: Number(row.disputeAmountMinor) },
    retentionDays: row.retentionDays as RetentionDays
  })
})

export const getAccount = Effect.fn("Workspaces.getAccount")(function*() {
  yield* Policy.require("settings", 1)
  const { workspaceId } = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) => load(sql, workspaceId))
})

import { Db } from "@insyte/database/Db"
import { Invalid, NotFound } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Redacted } from "effect"
import type { SqlClient } from "effect/sql"
import { SupplierApi } from "../../forwarding/domain/Forwarding.ts"
import { Sealer } from "../../shared/domain/Sealer.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"

/*
 * A supplier's own API (M8.2; domain.md §5 `supplier_integrations`), at `suppliers` Bewerken. Connecting takes the
 * supplier's https address and generates the secret Insyte signs with: sealed when stored, shown once in the answer and
 * never again (a new one means connecting again). The connection test is a signed `ping`, its outcome and latency kept.
 */

const secretOf = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return `whsec_${btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")}`
}

const exists = (sql: SqlClient.SqlClient, id: string) =>
  Effect.flatMap(
    sql`select 1 from suppliers where id = ${id} and deleted_at is null`,
    (rows) => rows.length === 0 ? Effect.fail(new NotFound({ entity: "supplier", id })) : Effect.void
  )

const audit = (sql: SqlClient.SqlClient, action: string, supplierId: string, diff?: Record<string, unknown>) =>
  Effect.flatMap(
    Effect.service(CurrentPrincipal),
    (p) =>
      Audit.write(sql, p.workspaceId, { kind: p.kind, id: p.id }, {
        action,
        subjectType: "supplier",
        subjectId: supplierId,
        diff
      })
  )

/** Connects (or reconnects, with a new secret) the supplier's API. Answers the secret, this once. */
export const connectApi = Effect.fn("Suppliers.connectApi")(function*(input: { id: string; url: string }) {
  yield* Policy.require("suppliers", 2)
  const url = (() => {
    try {
      return new URL(input.url.trim())
    } catch {
      return null
    }
  })()
  if (url === null || url.protocol !== "https:") return yield* new Invalid({ fields: { url: "https" } })
  const principal = yield* CurrentPrincipal
  const secret = secretOf()
  const { sealed } = yield* Effect.flatMap(Effect.service(Sealer), (s) => s.seal(secret))
  const db = yield* Db
  yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* exists(sql, input.id)
      yield* sql`insert into supplier_integrations (supplier_id, workspace_id, kind, enabled, webhook_url, secret_sealed)
                 values (${input.id}, ${principal.workspaceId}, 'custom', true, ${url.href}, ${sealed})
                 on conflict (supplier_id) do update set kind = 'custom', enabled = true, webhook_url = excluded.webhook_url,
                   secret_sealed = excluded.secret_sealed, last_ping_ok = null, last_ping_at = null, last_ping_ms = null`
      yield* audit(sql, "supplier.api_connected", input.id, { url: url.href })
    })
  )
  return { secret: Redacted.make(secret) }
})

export const disconnectApi = Effect.fn("Suppliers.disconnectApi")(function*(id: string) {
  yield* Policy.require("suppliers", 2)
  const db = yield* Db
  yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* exists(sql, id)
      yield* sql`update supplier_integrations set enabled = false where supplier_id = ${id}`
      yield* audit(sql, "supplier.api_disconnected", id)
    })
  )
})

/** "Verbinding testen": a signed ping to the supplier's API. */
export const testConnection = Effect.fn("Suppliers.testConnection")(function*(id: string) {
  yield* Policy.require("suppliers", 2)
  const db = yield* Db
  const [api] = yield* db.scoped((sql) =>
    Effect.andThen(
      exists(sql, id),
      sql<{ url: string; sealed: string }>`
        select webhook_url as url, secret_sealed as sealed from supplier_integrations
        where supplier_id = ${id} and kind = 'custom' and enabled`
    )
  )
  if (api === undefined) return { ok: false, ms: null, reason: "Geen API gekoppeld" }
  const secret = yield* Effect.flatMap(Effect.service(Sealer), (s) => s.open(api.sealed)).pipe(Effect.orDie)
  const outcome = yield* Effect.flatMap(
    Effect.service(SupplierApi),
    (s) => s.post(api.url, Redacted.value(secret), { type: "ping" })
  )
    .pipe(
      Effect.map(({ ms }) => ({ ok: true, ms, reason: null })),
      Effect.catchTag("SupplierApiError", (e) => Effect.succeed({ ok: false, ms: null, reason: e.reason }))
    )
  yield* db.scoped((sql) =>
    sql`update supplier_integrations set last_ping_ok = ${outcome.ok}, last_ping_at = now(), last_ping_ms = ${outcome.ms}
        where supplier_id = ${id}`
  )
  return outcome
})

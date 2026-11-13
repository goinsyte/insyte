import { Db } from "@insyte/database/Db"
import { NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal, CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { FileStore } from "../../shared/domain/Documents.ts"
import { Relay } from "../../shared/domain/Outbox.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { eraseShopper } from "../../shared/use-cases/ShopperErasure.ts"
import { type RequestAccess, type RequestErasure, type RequestMade, ShopperNotFound } from "../domain/Privacy.ts"
import { reachOf } from "./reads.ts"

/*
 * A shopper's requests (M17 step 5; security.md §6 "DSARs from shoppers"). They arrive from Shopify
 * (`customers/data_request`, `customers/redact`, M6.3, already written to `gdpr_requests` and the redaction already
 * done there), or the operator makes them here for a shopper who wrote in.
 *
 * - "Gegevens opvragen" makes the access package: every row Insyte holds about the shopper, as CSV and JSON in a ZIP,
 *   through the export run. It takes Exporteren (`data.export`) and Klanten · Bekijken. A request Shopify sent is
 *   answered the same way, by its id.
 * - "Gegevens wissen" erases at once, everywhere Insyte holds the shopper (`shared/use-cases/ShopperErasure.ts`);
 *   amounts, dates and statuses stay for the figures. It takes Klanten · Beheren, asks first and has no undo.
 *
 * Both reach only the stores the asker's role reaches: a shopper of another store is not found, and the package is
 * made from those stores only (`gdpr_requests.stores`).
 */

const DUE = "now() + interval '30 days'"

export const requestAccess = Effect.fn("Privacy.requestAccess")(function*(input: RequestAccess) {
  yield* Policy.requireAction("data.export")
  yield* Policy.require("customers", 1)
  const principal = yield* CurrentPrincipal
  const reach = reachOf(principal)
  const stores = reach === null ? null : [...reach]
  const db = yield* Db
  const files = yield* FileStore
  const { id, outboxId, earlier } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      let id: string
      let attempt: number
      let earlier: ReadonlyArray<string> = []
      if (input.requestId !== undefined) {
        // A request Shopify sent, answered (again): a new attempt, its earlier package gone.
        const [row] = yield* sql<{ id: string; attempts: number }>`
          update gdpr_requests set state = 'open', error = null, requested_by = ${principal.id}, stores = ${stores},
            attempts = attempts + 1, started_at = now(), files_removed_at = null
          where id = ${input.requestId} and kind = 'data_request' and state in ('open', 'failed', 'ready')
            and (${stores}::text[] is null or store_id = any(${stores}::text[]))
          returning id, attempts`
        if (row === undefined) return yield* new NotFound({ entity: "gdpr_request", id: input.requestId })
        id = row.id
        attempt = row.attempts
        const old = yield* sql<{ key: string }>`
          update files set deleted_at = now()
          where owner_type = 'gdpr_request' and owner_id = ${id} and deleted_at is null
          returning r2_key as key`
        earlier = old.map((f) => f.key)
      } else {
        const email = (input.email ?? "").trim().toLowerCase()
        const customers = yield* customersByEmail(sql, email, stores)
        if (customers.length === 0) return yield* new ShopperNotFound()
        id = mintId("gdpr")
        attempt = 1
        yield* sql.unsafe(
          `insert into gdpr_requests (id, workspace_id, kind, source, customer_id, subject, payload, due_at,
                                      requested_by, stores, state, attempts, started_at)
           values ($1, $2, 'data_request', 'operator', $3, $4, '{}'::jsonb, ${DUE}, $5, $6, 'open', 1, now())`,
          [id, principal.workspaceId, customers[0]!.id, email, principal.id, stores]
        )
      }
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: "customer.data_requested",
        subjectType: "gdpr_request",
        subjectId: id
      })
      const outboxId = yield* Outbox.write(sql, principal.workspaceId, {
        type: "privacy.export_requested",
        workspaceId: principal.workspaceId,
        userId: principal.id,
        requestId: id,
        attempt
      })
      return { id, outboxId, earlier }
    })
  )
  yield* files.remove(earlier)
  yield* Effect.flatMap(Effect.service(Relay), (relay) => relay.kick([outboxId]))
  return { id } satisfies RequestMade
})

/** The live customers with this address, in the stores the asker reaches (null: every store). */
const customersByEmail = (sql: SqlClient.SqlClient, email: string, stores: ReadonlyArray<string> | null) =>
  sql<{ id: string }>`
    select id from customers
    where email is not null and lower(email) = ${email} and merged_into is null and deleted_at is null
      and (${stores === null ? null : [...stores]}::text[] is null or store_id = any(${
    stores === null ? null : [...stores]
  }::text[]))
    order by last_order_at desc nulls last`

export const requestErasure = Effect.fn("Privacy.requestErasure")(function*(input: RequestErasure) {
  yield* Policy.require("customers", 3)
  const principal = yield* CurrentPrincipal
  const reach = reachOf(principal)
  const stores = reach === null ? null : [...reach]
  const db = yield* Db
  const files = yield* FileStore
  const email = input.email.trim().toLowerCase()
  const customers = yield* db.scoped((sql) => customersByEmail(sql, email, stores))
  if (customers.length === 0) return yield* new ShopperNotFound()
  // The erasure reaches every table, the log included: as `system`, for the member who asked.
  const { id, keys } = yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const erased = yield* eraseShopper(sql, { customerIds: customers.map((c) => c.id), emails: [email], stores })
      const id = mintId("gdpr")
      // The request keeps no address: what it names is what it erased.
      yield* sql.unsafe(
        `insert into gdpr_requests (id, workspace_id, kind, source, customer_id, payload, due_at, requested_by,
                                    stores, state, completed_at)
         values ($1, $2, 'customer_redact', 'operator', $3, $4::jsonb, ${DUE}, $5, $6, 'done', now())`,
        [
          id,
          principal.workspaceId,
          customers[0]!.id,
          JSON.stringify({ customers: erased.customers, orders: erased.orders }),
          principal.id,
          stores
        ]
      )
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: "customer.erased",
        subjectType: "gdpr_request",
        subjectId: id,
        diff: { customers: erased.customers, orders: erased.orders, files: erased.keys.length }
      })
      return { id, keys: erased.keys }
    })
  ).pipe(Effect.provideService(CurrentWorkspace, { id: principal.workspaceId }))
  for (let i = 0; i < keys.length; i += 1000) yield* files.remove(keys.slice(i, i + 1000))
  return { id } satisfies RequestMade
})

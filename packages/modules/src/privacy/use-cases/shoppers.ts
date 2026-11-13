import { Db } from "@insyte/database/Db"
import { NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { FileStore } from "../../shared/domain/Documents.ts"
import { Relay } from "../../shared/domain/Outbox.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { type RequestAccess, type RequestErasure, type RequestMade, ShopperNotFound } from "../domain/Privacy.ts"

/*
 * A shopper's requests (M17 step 5; security.md §6 "DSARs from shoppers"). They arrive from Shopify
 * (`customers/data_request`, `customers/redact`, M6.3, already written to `gdpr_requests` and the redaction already
 * done there), or the operator makes them here for a shopper who wrote in.
 *
 * - "Gegevens opvragen" makes the access package: every row Insyte holds about the shopper, as CSV and JSON in a ZIP,
 *   through the export run. It takes Exporteren (`data.export`) and Klanten · Bekijken. A request Shopify sent is
 *   answered the same way, by its id.
 * - "Gegevens wissen" erases at once: personal fields emptied, mail bodies replaced, mail files removed; amounts,
 *   dates and statuses stay for the figures. It takes Klanten · Beheren, asks first and has no undo.
 */

const DUE = "now() + interval '30 days'"

export const requestAccess = Effect.fn("Privacy.requestAccess")(function*(input: RequestAccess) {
  yield* Policy.requireAction("data.export")
  yield* Policy.require("customers", 1)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  const { id, outboxId } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      let id: string
      if (input.requestId !== undefined) {
        const [row] = yield* sql<{ id: string }>`
          update gdpr_requests set state = 'open', error = null, requested_by = ${principal.id}
          where id = ${input.requestId} and kind = 'data_request' and state in ('open', 'failed', 'ready')
          returning id`
        if (row === undefined) return yield* new NotFound({ entity: "gdpr_request", id: input.requestId })
        id = row.id
      } else {
        const email = (input.email ?? "").trim().toLowerCase()
        const customers = yield* customersByEmail(sql, email)
        if (customers.length === 0) return yield* new ShopperNotFound()
        id = mintId("gdpr")
        yield* sql.unsafe(
          `insert into gdpr_requests (id, workspace_id, kind, source, customer_id, subject, payload, due_at,
                                      requested_by, state)
           values ($1, $2, 'data_request', 'operator', $3, $4, '{}'::jsonb, ${DUE}, $5, 'open')`,
          [id, principal.workspaceId, customers[0]!.id, email, principal.id]
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
        requestId: id
      })
      return { id, outboxId }
    })
  )
  yield* Effect.flatMap(Effect.service(Relay), (relay) => relay.kick([outboxId]))
  return { id } satisfies RequestMade
})

const customersByEmail = (sql: SqlClient.SqlClient, email: string) =>
  sql<{ id: string }>`
    select id from customers where email is not null and lower(email) = ${email} and merged_into is null
    order by last_order_at desc nulls last`

export const requestErasure = Effect.fn("Privacy.requestErasure")(function*(input: RequestErasure) {
  yield* Policy.require("customers", 3)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  const files = yield* FileStore
  const email = input.email.trim().toLowerCase()
  const { id, keys } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const customers = yield* customersByEmail(sql, email)
      if (customers.length === 0) return yield* new ShopperNotFound()
      const ids = customers.map((c) => c.id)
      const keys = yield* erase(sql, ids, email)
      const id = mintId("gdpr")
      // The request keeps no address: what it names is what it erased.
      yield* sql.unsafe(
        `insert into gdpr_requests (id, workspace_id, kind, source, customer_id, payload, due_at, requested_by,
                                    state, completed_at)
         values ($1, $2, 'customer_redact', 'operator', $3, $4::jsonb, ${DUE}, $5, 'done', now())`,
        [id, principal.workspaceId, ids[0]!, JSON.stringify({ customers: ids.length }), principal.id]
      )
      yield* Audit.write(sql, principal.workspaceId, { kind: principal.kind, id: principal.id }, {
        action: "customer.erased",
        subjectType: "gdpr_request",
        subjectId: id,
        diff: { customers: ids.length }
      })
      return { id, keys }
    })
  )
  yield* files.remove(keys)
  return { id } satisfies RequestMade
})

/**
 * The shopper's personal fields emptied wherever Insyte holds them, as Shopify's `customers/redact` does for its
 * own (M6.3), and their mail: bodies replaced and the stored copies removed. Answers the bucket keys to remove.
 */
const erase = (sql: SqlClient.SqlClient, ids: ReadonlyArray<string>, email: string) =>
  Effect.gen(function*() {
    const list = [...ids]
    yield* sql`update customers set email = null, name = '', phone = null, address = null, raw = '{}'::jsonb,
                 deleted_at = coalesce(deleted_at, now())
               where id in ${sql.in(list)}`
    yield* sql`update orders set customer_name = '', customer_email = null, shipping_address = null, note = null,
                 raw = '{}'::jsonb
               where customer_id in ${sql.in(list)} or lower(customer_email) = ${email}`
    yield* sql`update returns set customer_name = '', customer_email = null, customer_note = null
               where customer_id in ${sql.in(list)} or lower(customer_email) = ${email}`
    yield* sql`update chargebacks set customer_name = '', raw = '{}'::jsonb where customer_id in ${sql.in(list)}`
    const mails = yield* sql<{ bodyHtmlKey: string }>`
      select m.body_html_key from email_messages m join email_threads t on t.id = m.thread_id
      where t.customer_id in ${sql.in(list)} and m.body_html_key is not null`
    yield* sql`update email_messages m set body_text = '[verwijderd]', from_name = null, body_html_key = null
               from email_threads t
               where t.id = m.thread_id and t.customer_id in ${sql.in(list)}`
    yield* sql`update email_threads set participants = '[]'::jsonb, last_message_preview = '[verwijderd]'
               where customer_id in ${sql.in(list)}`
    return mails.map((m) => m.bodyHtmlKey)
  })

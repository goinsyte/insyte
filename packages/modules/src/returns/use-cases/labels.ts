import { Db } from "@insyte/database/Db"
import { mintId } from "@insyte/domain/Ids"
import { Effect } from "effect"
import type { SqlClient, SqlError } from "effect/sql"
import { FileStore } from "../../shared/domain/Documents.ts"
import { Relay } from "../../shared/domain/Outbox.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { LabelNotIssued, Labels } from "../domain/Ports.ts"
import { returnAddress, SHOPPER, shopperAddress } from "./commands.ts"
import type { StoredLabel } from "./returns.ts"
import { load } from "./settings.ts"

/*
 * Return labels made (M9.2), as the steps `ReturnLabelWorkflow` makes durable, once a request's undo window has passed.
 * Each return still asked for gets its label from the carrier, its PDF kept in the files bucket and named on the return,
 * and a line in its history. A carrier that cannot be reached is tried again (the step fails, the Workflow retries); one
 * that refuses marks the label failed with its reason, so "Label versturen" can ask again. Inside the return's workspace
 * (`CurrentWorkspace`), as `system`.
 */

/** A parcel's weight where nothing better is known: one kilo is what most carriers price as the smallest parcel. */
const WEIGHT_GRAMS = 1000

type Outcome = "issued" | "failed" | "skipped"

/** A line in the return's history, by Insyte. */
const history = (sql: SqlClient.SqlClient, returnId: string, kind: "label_issued" | "note", text: string) =>
  sql`insert into return_events (id, workspace_id, return_id, actor, name, kind, text)
      values (${mintId("rev")}, app_workspace_id(), ${returnId}, 'insyte', null, ${kind}, ${text})`

const failed = (sql: SqlClient.SqlClient, id: string, carrier: string, reason: string) =>
  Effect.andThen(
    sql`update returns set label = ${JSON.stringify({ state: "failed", carrier, reason })}::jsonb
        where id = ${id} and label ->> 'state' = 'requested'`,
    history(sql, id, "note", `Retourlabel kon niet worden gemaakt: ${reason}`)
  )

/** One return's label, on its own transaction; the shopper's mail with it is `told`. */
const issueOne = (sql: SqlClient.SqlClient, id: string, told: Array<string>) =>
  Effect.gen(function*() {
    const [r] = yield* sql<{
      number: string
      label: string | null
      country: string | null
      customerEmail: string | null
      name: string | null
      line1: string | null
      postcode: string | null
      city: string | null
      shipCountry: string | null
    }>`
      select r.number, r.label::text as label, r.country, r.customer_email, ${sql.literal(SHOPPER)}
      from returns r join orders o on o.id = r.order_id left join customers c on c.id = r.customer_id
      where r.id = ${id} for update of r`
    const stored = r?.label === null || r?.label === undefined ? null : JSON.parse(r.label) as StoredLabel
    if (r === undefined || stored?.state !== "requested") return "skipped" as const
    const settings = yield* load(sql)
    const to = returnAddress(
      settings.addresses.map((a) => ({
        country: a.country,
        carrier: a.carrier,
        ...(a.name === null ? {} : { name: a.name }),
        ...(a.line1 === null ? {} : { line1: a.line1 }),
        ...(a.postcode === null ? {} : { postcode: a.postcode }),
        ...(a.city === null ? {} : { city: a.city })
      })),
      r.country
    )
    const from = shopperAddress({ ...r, country: r.shipCountry ?? r.country })
    if (to === undefined || from === undefined) {
      yield* failed(sql, id, stored.carrier, to === undefined ? "geen retouradres" : "geen adres van de klant")
      return "failed" as const
    }
    const labels = yield* Labels
    const label = yield* labels.issue({
      reference: r.number,
      carrier: stored.carrier,
      from: { ...from, ...(r.customerEmail === null ? {} : { email: r.customerEmail }) },
      to,
      weightGrams: WEIGHT_GRAMS
    })
    const [ws] = yield* sql<{ id: string }>`select app_workspace_id() as id`
    const key = `${ws!.id}/labels/${id}.pdf`
    yield* Effect.flatMap(Effect.service(FileStore), (s) => s.put(key, label.pdf, "application/pdf")).pipe(
      Effect.mapError((e) => new LabelNotIssued({ reason: e.reason, retry: true }))
    )
    const fileId = mintId("fil")
    yield* sql`insert into files (id, workspace_id, r2_key, name, mime, size_bytes, kind, owner_type, owner_id,
                                  uploaded_by, scan_state)
               values (${fileId}, ${ws!.id}, ${key}, ${`retourlabel-${r.number}.pdf`}, 'application/pdf',
                       ${label.pdf.length}, 'document', 'return', ${id}, 'system', 'clean')
               on conflict (r2_key) do update set size_bytes = excluded.size_bytes, deleted_at = null`
    const [file] = yield* sql<{ id: string }>`select id from files where r2_key = ${key}`
    yield* sql`update returns set label = ${
      JSON.stringify({
        state: "issued",
        carrier: label.carrier,
        tracking: label.tracking,
        trackingUrl: label.trackingUrl,
        sentAt: Date.now(),
        fileId: file?.id ?? fileId
      })
    }::jsonb, label_parcel_ref = ${label.parcelRef} where id = ${id}`
    yield* history(sql, id, "label_issued", `Retourlabel van ${label.carrier} gemaakt`)
    // The shopper gets it by mail (M9.3).
    told.push(
      yield* Outbox.write(sql, ws!.id, {
        type: "return.label_issued",
        workspaceId: ws!.id,
        userId: "system",
        returnIds: [id]
      })
    )
    return "issued" as const
  }).pipe(
    // A refusal is the carrier's answer: the label failed. Unreachable is left to the Workflow's retry.
    Effect.catchTag(
      "LabelNotIssued",
      (e): Effect.Effect<"failed", LabelNotIssued | SqlError.SqlError> =>
        e.retry ? Effect.fail(e) : Effect.as(failedFor(sql, id, e.reason), "failed" as const)
    )
  )

/** A refusal on a return whose carrier is in its stored label. */
const failedFor = (sql: SqlClient.SqlClient, id: string, reason: string) =>
  Effect.flatMap(
    sql<{ carrier: string | null }>`select label ->> 'carrier' as carrier from returns where id = ${id}`,
    ([row]) => failed(sql, id, row?.carrier ?? "", reason)
  )

/** The step: each return's label; a carrier that could not be reached fails it, to be tried again. */
export const issueLabels = Effect.fn("Returns.issueLabels")(function*(ids: ReadonlyArray<string>) {
  const db = yield* Db
  const outcomes: Array<{ id: string; outcome: Outcome }> = []
  const told: Array<string> = []
  let retry: LabelNotIssued | undefined
  for (const id of ids) {
    const mine: Array<string> = []
    const outcome = yield* db.scopedFor((sql) =>
      issueOne(sql, id, mine).pipe(Effect.catchTag("LabelNotIssued", (e) => {
        retry = e
        return Effect.succeed("skipped" as const)
      }))
    )
    // Only what committed: a transaction that rolled back wrote no mail.
    told.push(...mine)
    outcomes.push({ id, outcome })
  }
  if (told.length > 0) yield* (yield* Relay).kick(told)
  if (retry !== undefined) return yield* retry
  return outcomes
})

/** The Workflow gave up on the carrier: what is still asked for failed. */
export const abandonLabels = Effect.fn("Returns.abandonLabels")(function*(ids: ReadonlyArray<string>) {
  const db = yield* Db
  yield* db.scopedFor((sql) =>
    Effect.forEach(ids, (id) => failedFor(sql, id, "de vervoerder was niet bereikbaar"), { discard: true })
  )
})

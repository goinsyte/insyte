import { Effect } from "effect"
import type { SqlClient } from "effect/sql"

/*
 * A shopper erased (security.md §6 "DSARs from shoppers"; GDPR art. 17): for "Gegevens wissen" on Je gegevens and
 * for Shopify's `customers/redact` alike. As `system` in the workspace, in the caller's transaction.
 *
 * Who: the customers named (by id, by address), the duplicates merged into them and the one they were merged into, and
 * the orders that are theirs or carry their address (plus any the caller names). What: their personal fields emptied
 * wherever the slices keep them (the customer, the orders and their notes and mails, a supplier's note on their parcel,
 * returns and their shopper events, chargebacks and their evidence, tickets and comments, mail threads and messages,
 * earlier requests about them and their packages), the files that hold them marked deleted (the caller removes them
 * from the bucket after the commit), then every text left in the workspace, the log and the chat included, scrubbed of
 * their address, name and phone (`scrub_workspace`, 0076). That last pass reaches the Data hub's imported rows (0073)
 * and Insyte AI's drafts and calls (0074) too; what they keep in the bucket goes here: a CSV whose rows name them loses
 * the file as uploaded, and a Data hub export that may hold them (any the erasure's stores reach) is taken away, a
 * ready one's file at once (the nightly sweep empties its folder), one still being written stopped. An address or name
 * a customer of a store the erasure does not reach also has is not scrubbed: that shopper is not the asker's to erase.
 * Amounts, dates and statuses stay.
 *
 * Not here: a supplier's quality-check media (photos of goods, the supplier's), and webhook bodies as received
 * (`inbound_events`, applied and kept for days only).
 */

export interface ShopperSeeds {
  readonly customerIds: ReadonlyArray<string>
  readonly emails: ReadonlyArray<string>
  readonly orderIds?: ReadonlyArray<string>
  /** The stores the erasure reaches: the asker's role's, or the store a webhook came from; null for all. */
  readonly stores: ReadonlyArray<string> | null
}

export interface Erased {
  readonly customers: number
  readonly orders: number
  /** The bucket keys to remove once the transaction commits. */
  readonly keys: ReadonlyArray<string>
  /** Rows the last pass changed. */
  readonly scrubbed: number
}

const REGEX = /[.*+?^${}()|[\]\\]/g

/** A literal as a pattern that matches it whole, not inside a longer word or number. */
const pattern = (literal: string) => `(?<![[:alnum:]])${literal.replace(REGEX, "\\$&")}(?![[:alnum:]])`

/*
 * From an address, only who and how to reach them: a street is shared by a household or a building, and erasing it
 * everywhere would erase their neighbours' too. The address fields themselves are emptied where they are kept.
 */
const ADDRESS_KEYS = ["phone", "name"] as const

/** What to look for in the rest of the workspace: each literal as typed, and as JSON writes it. */
export const needles = (values: ReadonlyArray<string | null | undefined>) => {
  const kept = new Set<string>()
  for (const value of values) {
    const v = (value ?? "").trim()
    // Short values (a first name, a house number) would erase other people's text too.
    const digits = v.replace(/\D/g, "").length
    if (v.length < 5 && !(v.includes("@") && v.length >= 3)) continue
    if (/^[\d\s+()-]+$/.test(v) && digits < 6) continue
    kept.add(v)
    kept.add(JSON.stringify(v).slice(1, -1))
  }
  return [...kept].map(pattern)
}

const fromAddress = (text: string | null) => {
  if (text === null) return []
  try {
    const value = JSON.parse(text) as Record<string, unknown> | null
    if (value === null || typeof value !== "object") return []
    const name = [value["first_name"], value["last_name"]].filter((v) => typeof v === "string").join(" ")
    return [...ADDRESS_KEYS.map((k) => value[k]), name].filter((v): v is string => typeof v === "string")
  } catch {
    return []
  }
}

export const eraseShopper = (sql: SqlClient.SqlClient, seeds: ShopperSeeds) =>
  Effect.gen(function*() {
    const emails = [...new Set(seeds.emails.map((e) => e.trim().toLowerCase()).filter((e) => e !== ""))]
    const stores = seeds.stores === null ? null : [...seeds.stores]
    const customers = yield* sql.unsafe<
      { id: string; email: string | null; name: string; phone: string | null; address: string | null }
    >(
      `with recursive found (id, merged_into) as (
         select id, merged_into from customers
          where (id = any($1::text[]) or (email is not null and lower(email) = any($2::text[])))
            and ($3::text[] is null or store_id = any($3))
         union
         select c.id, c.merged_into from customers c join found f on c.merged_into = f.id or c.id = f.merged_into
          where $3::text[] is null or c.store_id = any($3)
       )
       select id, email, name, phone, address::text as address from customers where id in (select id from found)`,
      [[...seeds.customerIds], emails, stores]
    )
    const ids = customers.map((c) => c.id)
    const known = [
      ...new Set([...emails, ...customers.flatMap((c) => c.email === null ? [] : [c.email.toLowerCase()])])
    ]
    const orders = yield* sql.unsafe<{ id: string; name: string; email: string | null; address: string | null }>(
      `select id, customer_name as name, customer_email as email, shipping_address::text as address from orders
        where (customer_id = any($1::text[]) or id = any($2::text[])
               or (customer_email is not null and lower(customer_email) = any($3::text[])))
          and ($4::text[] is null or store_id = any($4))`,
      [ids, [...(seeds.orderIds ?? [])], known, stores]
    )
    const orderIds = orders.map((o) => o.id)
    const all = [...new Set([...known, ...orders.flatMap((o) => o.email === null ? [] : [o.email.toLowerCase()])])]
    const values = [
      ...all,
      ...customers.flatMap((c) => [c.name, c.phone, ...fromAddress(c.address)]),
      ...orders.flatMap((o) => [o.name, ...fromAddress(o.address)])
    ].filter((v): v is string => typeof v === "string" && v.trim() !== "")
    // What a customer of a store out of reach shares with them stays.
    const outside = stores === null ? [] : yield* sql.unsafe<{ value: string }>(
      `select lower(v) as value from customers c, unnest(array[c.email, c.name, c.phone]) v
        where not (c.store_id = any($1::text[])) and v is not null and lower(v) = any($2::text[])`,
      [stores, values.map((v) => v.trim().toLowerCase())]
    )
    const shared = new Set(outside.map((o) => o.value))
    const patterns = needles(values.filter((v) => !shared.has(v.trim().toLowerCase())))
    const fileIds: Array<string> = []
    const keys: Array<string> = []

    yield* sql`update customers set email = null, name = '', phone = null, address = null, raw = '{}'::jsonb,
                 tags = '{}', deleted_at = coalesce(deleted_at, now())
               where id = any(${ids}::text[])`
    yield* sql`update orders set customer_name = '', customer_email = null, shipping_address = null, note = null,
                 raw = '{}'::jsonb, supplier_note = null, card_last4 = null
               where id = any(${orderIds}::text[])`
    yield* sql`update order_notes set body = '[verwijderd]' where order_id = any(${orderIds}::text[])`
    // What the supplier wrote about their parcel on its portal (0075); the carrier and tracking stay, as the order's.
    yield* sql`update supplier_work set problem_note = null
               where order_id = any(${orderIds}::text[]) and problem_note is not null`
    yield* sql`update order_mails set to_address = '', subject = '[verwijderd]', paragraphs = '{}'
               where order_id = any(${orderIds}::text[])`
    // The portal's photos, before they belong to a return, are kept against the order.
    const portal = yield* sql<{ id: string }>`
      select id from files where owner_type = 'portal' and owner_id = any(${orderIds}::text[]) and deleted_at is null`
    fileIds.push(...portal.map((f) => f.id))

    const returns = yield* sql<{ id: string }>`
      update returns set customer_name = '', customer_email = null, customer_note = '', label = null
      where customer_id = any(${ids}::text[]) or order_id = any(${orderIds}::text[])
         or (customer_email is not null and lower(customer_email) = any(${all}::text[]))
      returning id`
    const returnIds = returns.map((r) => r.id)
    yield* sql`update return_events set name = null, text = '[verwijderd]', data = '{}'::jsonb
               where return_id = any(${returnIds}::text[]) and actor = 'shopper'`
    yield* sql`update return_events set data = '{}'::jsonb where return_id = any(${returnIds}::text[])`
    yield* sql`update return_lines set photos = '{}' where return_id = any(${returnIds}::text[])`
    const returnFiles = yield* sql<{ id: string }>`
      select id from files where owner_type = 'return' and owner_id = any(${returnIds}::text[]) and deleted_at is null`
    fileIds.push(...returnFiles.map((f) => f.id))

    const chargebacks = yield* sql<{ id: string }>`
      update chargebacks set customer_name = '', raw = null, note = ''
      where customer_id = any(${ids}::text[]) or order_id = any(${orderIds}::text[])
      returning id`
    const chargebackIds = chargebacks.map((c) => c.id)
    const evidence = yield* sql<{ fileId: string | null }>`
      update evidence_items set name = '[verwijderd]', removed_at = coalesce(removed_at, now())
      where chargeback_id = any(${chargebackIds}::text[])
      returning file_id`
    const packs = yield* sql<{ fileId: string | null }>`
      update evidence_packs set narrative_text = '' where chargeback_id = any(${chargebackIds}::text[])
      returning pdf_file_id as file_id`
    const caseFiles = yield* sql<{ id: string }>`
      select id from files where owner_type = 'chargeback' and owner_id = any(${chargebackIds}::text[]) and deleted_at is null`
    fileIds.push(
      ...[...evidence, ...packs].flatMap((e) => (e.fileId === null ? [] : [e.fileId])),
      ...caseFiles.map((f) => f.id)
    )

    const tickets = yield* sql<{ id: string }>`
      update tickets set title = '[verwijderd]', description = ''
      where customer_id = any(${ids}::text[]) or order_id = any(${orderIds}::text[])
      returning id`
    yield* sql`update ticket_comments set body = '[verwijderd]' where ticket_id = any(${
      tickets.map((t) => t.id)
    }::text[])`

    const threads = yield* sql<{ id: string }>`
      select id from email_threads
      where customer_id = any(${ids}::text[])
         or exists (select 1 from unnest(${all}::text[]) e where strpos(lower(participants::text), e) > 0)`
    const threadIds = threads.map((t) => t.id)
    const messages = yield* sql<{ id: string; bodyHtmlKey: string | null }>`
      select id, body_html_key from email_messages
      where thread_id = any(${threadIds}::text[])
         or lower(from_address) = any(${all}::text[])
         or exists (select 1 from unnest(${all}::text[]) e
                    where strpos(lower("to"::text), e) > 0 or strpos(lower(cc::text), e) > 0)`
    const messageIds = messages.map((m) => m.id)
    keys.push(...messages.flatMap((m) => (m.bodyHtmlKey === null ? [] : [m.bodyHtmlKey])))
    yield* sql`update email_messages set from_name = '', from_address = '', "to" = '[]'::jsonb, cc = '[]'::jsonb,
                 subject = '', body_text = '[verwijderd]', body_html_key = null
               where id = any(${messageIds}::text[])`
    yield* sql`update email_threads set subject = '[verwijderd]', participants = '[]'::jsonb,
                 last_message_preview = ''
               where id = any(${threadIds}::text[])`
    const attachments = yield* sql<{ id: string }>`
      select id from files where owner_type = 'email_message' and owner_id = any(${messageIds}::text[])
        and deleted_at is null`
    fileIds.push(...attachments.map((f) => f.id))

    // Earlier requests about them keep no address, and their packages go.
    const requests = yield* sql<{ id: string }>`
      update gdpr_requests set subject = null, payload = '{}'::jsonb
      where kind in ('data_request', 'customer_redact')
        and (customer_id = any(${ids}::text[]) or (subject is not null and lower(subject) = any(${all}::text[])))
      returning id`
    const requestIds = requests.map((r) => r.id)
    const packages = yield* sql<{ id: string }>`
      select id from files where owner_type = 'gdpr_request' and owner_id = any(${requestIds}::text[]) and deleted_at is null`
    fileIds.push(...packages.map((f) => f.id))
    yield* sql`update gdpr_requests set files_removed_at = now() where id = any(${requestIds}::text[])`

    // The Data hub (0073): an uploaded CSV that names them, and the exports that may hold them.
    const imported = yield* sql<{ id: string }>`
      select f.id from files f
      where f.owner_type = 'import' and f.deleted_at is null
        and f.id in (select i.file_id from imports i
                     where exists (select 1 from import_rows r, unnest(r.cells) c
                                   where r.import_id = i.id and c ~* any(${patterns}::text[])))`
    fileIds.push(...imported.map((f) => f.id))
    const exported = yield* sql<{ fileId: string | null }>`
      update exports set expires_at = now()
      where state = 'ready' and expires_at > now()
        and (${stores}::text[] is null or store_scope is null or store_scope && ${stores}::text[] or source = 'import')
      returning file_id`
    fileIds.push(...exported.flatMap((e) => (e.fileId === null ? [] : [e.fileId])))
    yield* sql`update exports set state = 'failed', error = 'erased', finished_at = now()
               where state in ('queued', 'running')
                 and (${stores}::text[] is null or store_scope is null or store_scope && ${stores}::text[]
                      or source = 'import')`

    const removed = yield* sql<{ key: string }>`
      update files set deleted_at = now(), name = '[verwijderd]'
      where id = any(${[...new Set(fileIds)]}::text[])
      returning r2_key as key`
    keys.push(...removed.map((f) => f.key))

    const [scrub] = yield* sql<{ n: number }>`select scrub_workspace(${patterns}::text[]) as n`
    return { customers: ids.length, orders: orderIds.length, keys, scrubbed: scrub?.n ?? 0 } satisfies Erased
  })

import { Db } from "@insyte/database/Db"
import { Conflict, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import * as Audit from "../../shared/use-cases/Audit.ts"
import {
  type ConnectInput,
  type MailboxProvider,
  MailboxView,
  ProviderUnavailable,
  type SignatureInput
} from "../domain/Inbox.ts"
import { mailDomain } from "./inbound.ts"

/*
 * The team's mailboxes (M11 step 1; integrations.md §3). The first is a forwarding address: Insyte gives the workspace
 * `support-<slug>@<INBOUND_MAIL_DOMAIN>`, the operator forwards their own support address to it, and replies go out
 * from Insyte's sending domain with the operator's address as `Reply-To`. Gmail and Outlook wait for their verified
 * OAuth apps (step 1b): connecting one is refused as not yet available. Reading the mailboxes is Klantenservice ·
 * Bekijken; adding, removing and their settings Beheren.
 */

interface Row {
  readonly id: string
  readonly provider: MailboxProvider
  readonly address: string
  readonly forwardingAddress: string | null
  readonly label: string
  readonly signature: string
  readonly isDefault: boolean
  readonly status: "connected" | "disconnected"
  readonly lastSyncedAt: Date | null
  readonly threads: number
}

const viewsOf = (sql: SqlClient.SqlClient, id?: string) =>
  Effect.map(
    sql<Row>`
      select m.id, m.provider, m.address, m.forwarding_address, m.label, m.signature, m.is_default, m.status,
             m.last_synced_at,
             (select count(*)::int from email_threads t where t.mailbox_id = m.id and t.archived_at is null
                and t.spam_at is null and t.deleted_at is null) as threads
      from mailboxes m where ${id === undefined ? sql.literal("true") : sql`m.id = ${id}`}
      order by m.is_default desc, m.created_at, m.id`,
    (rows) =>
      rows.map((r) =>
        new MailboxView({
          id: r.id,
          provider: r.provider,
          address: r.address,
          forwardingAddress: r.forwardingAddress,
          label: r.label,
          signature: r.signature,
          isDefault: r.isDefault,
          status: r.status,
          lastSyncedAt: r.lastSyncedAt?.getTime() ?? null,
          threads: r.threads
        })
      )
  )

const audit = (sql: SqlClient.SqlClient, action: string, id: string, diff?: Record<string, unknown>) =>
  Effect.flatMap(
    Effect.service(CurrentPrincipal),
    (p) =>
      Audit.write(sql, p.workspaceId, { kind: p.kind, id: p.id }, {
        action,
        subjectType: "mailbox",
        subjectId: id,
        diff
      })
  )

const one = (sql: SqlClient.SqlClient, id: string) =>
  Effect.flatMap(
    viewsOf(sql, id),
    ([m]) => m === undefined ? new NotFound({ entity: "mailbox", id }) : Effect.succeed(m)
  )

export const list = Effect.fn("Mailboxes.list")(function*() {
  yield* Policy.require("support", 1)
  const db = yield* Db
  return yield* db.scoped((sql) => viewsOf(sql))
})

/** A short random tail for an address another workspace already has. */
const tail = () => Math.random().toString(36).slice(2, 6)

/** "Inbox koppelen": the forwarding address now; Gmail and Outlook once their apps are verified. */
export const connect = Effect.fn("Mailboxes.connect")(function*(input: typeof ConnectInput.Type) {
  yield* Policy.require("support", 3)
  if (input.provider !== "forward") return yield* new ProviderUnavailable({ provider: input.provider })
  const principal = yield* CurrentPrincipal
  const domain = yield* mailDomain
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const address = input.address.trim().toLowerCase()
      const [taken] = yield* sql`select 1 from mailboxes where lower(address) = ${address} and status = 'connected'`
      if (taken !== undefined) return yield* new Conflict({ entity: "mailbox", reason: "address_connected" })
      const [ws] = yield* sql<{ slug: string }>`select slug from workspaces where id = ${principal.workspaceId}`
      const [hasDefault] = yield* sql`select 1 from mailboxes where is_default and status = 'connected'`
      // A disconnected mailbox of the same address comes back with its threads and its forwarding address.
      const [old] = yield* sql<{ id: string }>`select id from mailboxes where lower(address) = ${address}`
      if (old !== undefined) {
        yield* sql`update mailboxes set status = 'connected', disconnected_at = null, label = ${input.label.trim()},
                     is_default = ${hasDefault === undefined} where id = ${old.id}`
        yield* audit(sql, "mailbox.connected", old.id, { provider: "forward", again: true })
        return yield* one(sql, old.id)
      }
      const id = mintId("mbx")
      // The address is unique across every workspace, and the others are out of sight: the insert says whether it is
      // free, and a short tail makes another until one is.
      for (let attempt = 0; attempt < 8; attempt++) {
        const forwarding = `support-${ws!.slug}${attempt === 0 ? "" : `-${tail()}`}@${domain}`
        const inserted = yield* sql`
          insert into mailboxes (id, workspace_id, provider, forwarding_address, address, label, is_default, created_by)
          values (${id}, ${principal.workspaceId}, 'forward', ${forwarding}, ${address}, ${input.label.trim()},
                  ${hasDefault === undefined}, ${principal.id})
          on conflict (forwarding_address) do nothing returning id`
        if (inserted.length > 0) break
      }
      yield* audit(sql, "mailbox.connected", id, { provider: "forward" })
      return yield* one(sql, id)
    })
  )
})

/** "Ontkoppelen": nothing more arrives or leaves; its threads stay readable. Another mailbox becomes the default. */
export const disconnect = Effect.fn("Mailboxes.disconnect")(function*(input: { readonly id: string }) {
  yield* Policy.require("support", 3)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const m = yield* one(sql, input.id)
      if (m.status === "disconnected") return m
      yield* sql`update mailboxes set status = 'disconnected', disconnected_at = now(), is_default = false
                 where id = ${m.id}`
      if (m.isDefault) {
        yield* sql`update mailboxes set is_default = true where id = (
                     select id from mailboxes where status = 'connected' order by created_at limit 1)`
      }
      yield* audit(sql, "mailbox.disconnected", m.id)
      return yield* one(sql, m.id)
    })
  )
})

/** "Als standaard instellen": where "Nieuwe e-mail" sends from. */
export const setDefault = Effect.fn("Mailboxes.setDefault")(function*(input: { readonly id: string }) {
  yield* Policy.require("support", 3)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const m = yield* one(sql, input.id)
      if (m.status !== "connected") return yield* new Conflict({ entity: "mailbox", reason: "disconnected" })
      if (m.isDefault) return m
      yield* sql`update mailboxes set is_default = false where is_default`
      yield* sql`update mailboxes set is_default = true where id = ${m.id}`
      yield* audit(sql, "mailbox.default_set", m.id)
      return yield* one(sql, m.id)
    })
  )
})

/** The signature every reply, forward and new mail from this mailbox ends with. */
export const setSignature = Effect.fn("Mailboxes.setSignature")(function*(input: typeof SignatureInput.Type) {
  yield* Policy.require("support", 3)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const m = yield* one(sql, input.id)
      yield* sql`update mailboxes set signature = ${input.signature.trim()} where id = ${m.id}`
      yield* audit(sql, "mailbox.signature_set", m.id)
      return yield* one(sql, m.id)
    })
  )
})

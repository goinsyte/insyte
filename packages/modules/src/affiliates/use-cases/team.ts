import { Db } from "@insyte/database/Db"
import { Invalid, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { InvitationLinks } from "../../members/domain/Ports.ts"
import { FileStore } from "../../shared/domain/Documents.ts"
import { Relay } from "../../shared/domain/Outbox.ts"
import { UNDO_SECONDS } from "../../shared/domain/Undo.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import { AffiliatesChange, InviteRow, type ResourceKind, ResourceRow, type Tier } from "../domain/Affiliates.ts"
import type { InviteInput } from "../domain/Inputs.ts"
import { audit, everyStore, RESTORE } from "./operator.ts"
import { programOf, startProgram } from "./program.ts"

/** The invitation's mail (`member.invited`, the team's own mail sink), held back by the undo window. */
const mailLater = (sql: SqlClient.SqlClient, invitationId: string, round: number) =>
  Effect.flatMap(Effect.service(CurrentPrincipal), (p) =>
    Outbox.write(sql, p.workspaceId, {
      type: "member.invited",
      workspaceId: p.workspaceId,
      invitationId,
      invitedBy: p.id,
      userId: p.userId ?? p.id,
      round
    }, { afterSeconds: UNDO_SECONDS }))

/** The invitation's mail that has not gone yet, cancelled. */
const cancelMail = (sql: SqlClient.SqlClient, invitationIds: ReadonlyArray<string>) =>
  sql`update outbox set cancelled_at = now()
      where event = 'member.invited' and payload ->> 'invitationId' in ${sql.in([...invitationIds])}
        and relayed_at is null and cancelled_at is null`

/*
 * Inviting affiliates and the material the brand shares (M16 step 5; widgets/06 Part C). An invitation is the team's
 * (`invitations`, kind `affiliate`), mailed once the undo window has passed; who takes it up becomes an affiliate on
 * the tier it names (`affiliate_join`, 0108). The link anyone can apply through is the programme's public page.
 * Resources are files in the bucket, uploaded at Bewerken and downloaded by the affiliates in their portal.
 */

/** An affiliate invitation is valid two weeks, and a resend starts it again. */
export const AFFILIATE_INVITATION_DAYS = 14

export const invites = Effect.fn("Affiliates.invites")(function*() {
  yield* Policy.require("affiliates", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.map(
      sql<{ id: string; name: string | null; email: string; tier: Tier | null; sentAt: Date; expiresAt: Date }>`
        select id, name, email, affiliate_tier as tier, sent_at, expires_at from invitations
        where kind = 'affiliate' and accepted_at is null and revoked_at is null and declined_at is null
        order by sent_at desc, id limit 500`,
      (rows) =>
        rows.map((r) =>
          new InviteRow({
            id: r.id,
            name: r.name,
            email: r.email,
            tier: r.tier ?? "bronze",
            sentAt: r.sentAt.getTime(),
            expiresAt: r.expiresAt.getTime(),
            lapsed: r.expiresAt.getTime() <= Date.now()
          })
        )
    )
  )
})

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const invite = Effect.fn("Affiliates.invite")(function*(input: InviteInput) {
  yield* Policy.require("affiliates", 2)
  yield* everyStore
  const principal = yield* CurrentPrincipal
  const links = yield* InvitationLinks
  const relay = yield* Relay
  const db = yield* Db
  const email = input.email.trim().toLowerCase()
  if (!EMAIL.test(email)) return yield* new Invalid({ fields: { email: "format" } })
  const result = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      // The brand's first invitation starts its programme.
      yield* startProgram(sql)
      const [affiliate] = yield* sql`select 1 from affiliates where email = ${email}`
      if (affiliate !== undefined) return yield* new Invalid({ fields: { email: "affiliate" } })
      const [open] = yield* sql<{ id: string; round: number; lapsed: boolean }>`
        select id, round, expires_at <= now() as lapsed from invitations
        where kind = 'affiliate' and email = ${email} and accepted_at is null and revoked_at is null
          and declined_at is null`
      if (open !== undefined && !open.lapsed) return yield* new Invalid({ fields: { email: "invited" } })
      const id = open?.id ?? mintId("inv")
      const round = open === undefined ? 0 : open.round + 1
      const { tokenHash } = yield* links.invitation(id, round)
      const name = input.name?.trim() || null
      const message = input.message?.trim() || null
      if (open === undefined) {
        yield* sql`insert into invitations (id, workspace_id, kind, email, name, token_hash, round, affiliate_tier,
                                            message, invited_by, expires_at)
                   values (${id}, ${principal.workspaceId}, 'affiliate', ${email}, ${name}, decode(${tokenHash}, 'hex'),
                           0, ${input.tier}, ${message}, ${principal.id},
                           now() + make_interval(days => ${AFFILIATE_INVITATION_DAYS}))`
      } else {
        yield* sql`update invitations set token_hash = decode(${tokenHash}, 'hex'), round = ${round}, name = ${name},
                     affiliate_tier = ${input.tier}, message = ${message}, invited_by = ${principal.id},
                     sent_at = now(), expires_at = now() + make_interval(days => ${AFFILIATE_INVITATION_DAYS})
                   where id = ${id}`
      }
      yield* audit(sql, "affiliate.invited", "invitation", id, { tier: input.tier })
      const mail = yield* mailLater(sql, id, round)
      const undo = yield* Undo.issue(sql, {
        command: RESTORE,
        compensation: { kind: "invite", invitationId: id },
        outboxIds: [mail]
      })
      return { change: new AffiliatesChange({ ids: [id], undo }), outboxIds: [mail] }
    })
  )
  yield* relay.kick(result.outboxIds, { afterSeconds: UNDO_SECONDS })
  return result.change
})

export const resend = Effect.fn("Affiliates.resendInvite")(function*(invitationId: string) {
  yield* Policy.require("affiliates", 2)
  yield* everyStore
  const principal = yield* CurrentPrincipal
  const links = yield* InvitationLinks
  const relay = yield* Relay
  const db = yield* Db
  const outboxIds = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [open] = yield* sql<{ round: number }>`
        select round from invitations where id = ${invitationId} and kind = 'affiliate' and accepted_at is null
          and revoked_at is null and declined_at is null for update`
      if (open === undefined) return yield* new NotFound({ entity: "invitation", id: invitationId })
      const round = open.round + 1
      const { tokenHash } = yield* links.invitation(invitationId, round)
      yield* sql`update invitations set token_hash = decode(${tokenHash}, 'hex'), round = ${round}, sent_at = now(),
                   invited_by = ${principal.id}, expires_at = now() + make_interval(days => ${AFFILIATE_INVITATION_DAYS})
                 where id = ${invitationId}`
      yield* audit(sql, "affiliate.invite_resent", "invitation", invitationId)
      return [yield* mailLater(sql, invitationId, round)]
    })
  )
  yield* relay.kick(outboxIds, { afterSeconds: UNDO_SECONDS })
  return new AffiliatesChange({ ids: [invitationId], undo: null })
})

export const revoke = Effect.fn("Affiliates.revokeInvite")(function*(invitationId: string) {
  yield* Policy.require("affiliates", 2)
  yield* everyStore
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [r] = yield* sql<{ id: string }>`
        update invitations set revoked_at = now(), revoked_by = ${principal.id}
        where id = ${invitationId} and kind = 'affiliate' and accepted_at is null and revoked_at is null
          and declined_at is null
        returning id`
      if (r === undefined) return yield* new NotFound({ entity: "invitation", id: invitationId })
      yield* cancelMail(sql, [r.id])
      yield* audit(sql, "affiliate.invite_revoked", "invitation", r.id)
      const undo = yield* Undo.issue(sql, { command: RESTORE, compensation: { kind: "unrevoke", invitationId: r.id } })
      return new AffiliatesChange({ ids: [r.id], undo })
    })
  )
})

/** The programme's public page, once the brand started it; empty before (a read never starts one). */
export const inviteLink = Effect.fn("Affiliates.inviteLink")(function*() {
  yield* Policy.require("affiliates", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.map(programOf(sql), (p) => ({ url: p === undefined ? "" : `/partners/${p.applySlug}` }))
  )
})

// ─── Resources ───────────────────────────────────────────────────────────────────────────────────────────────────────

const MAX_RESOURCE_BYTES = 25 * 1024 * 1024
const TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
  "video/mp4": "mp4",
  "application/zip": "zip"
}

const startsWith = (bytes: Uint8Array, signature: ReadonlyArray<number>, at = 0) =>
  signature.every((b, i) => bytes[at + i] === b)

const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0))

/** The file's own first bytes agree with the type it was sent as (an SVG: XML that opens with an \`<svg\` element). */
export const looksLike = (mime: string, bytes: Uint8Array): boolean => {
  switch (mime) {
    case "image/png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case "image/jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff])
    case "image/webp":
      return startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)
    case "application/pdf":
      return startsWith(bytes, ascii("%PDF-"))
    case "video/mp4":
      return startsWith(bytes, ascii("ftyp"), 4)
    case "application/zip":
      return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])
    case "image/svg+xml": {
      const head = new TextDecoder().decode(bytes.subarray(0, 1024)).replace(/^\uFEFF/, "")
      const body = head.replace(/^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?/i, "")
      return /^<svg[\s>]/i.test(body)
    }
    default:
      return false
  }
}

const resourceOf = (
  r: { id: string; kind: ResourceKind; title: string; mime: string; sizeBytes: string; updatedAt: Date },
  path: (id: string) => string
) =>
  new ResourceRow({
    id: r.id,
    kind: r.kind,
    title: r.title,
    mime: r.mime,
    sizeBytes: Number(r.sizeBytes),
    updatedAt: r.updatedAt.getTime(),
    path: path(r.id)
  })

export const resourceRows = (sql: SqlClient.SqlClient, path: (id: string) => string) =>
  Effect.map(
    sql<{ id: string; kind: ResourceKind; title: string; mime: string; sizeBytes: string; updatedAt: Date }>`
      select id, kind, title, mime, size_bytes, updated_at from affiliate_resources
      where archived_at is null order by updated_at desc, id desc limit 200`,
    (rows) => rows.map((r) => resourceOf(r, path))
  )

export const resources = Effect.fn("Affiliates.resources")(function*() {
  yield* Policy.require("affiliates", 1)
  const db = yield* Db
  return yield* db.scoped((sql) => resourceRows(sql, (id) => `/api/affiliates/resources/${id}`))
})

/** "Uploaden" at Bewerken: the file into the bucket and a resource every affiliate of the brand sees. */
export const upload = Effect.fn("Affiliates.uploadResource")(function*(input: {
  readonly title: string
  readonly kind: ResourceKind
  readonly name: string
  readonly mime: string
  readonly bytes: Uint8Array
}) {
  yield* Policy.require("affiliates", 2)
  yield* everyStore
  const principal = yield* CurrentPrincipal
  const mime = input.mime.toLowerCase().split(";")[0]!.trim()
  const extension = TYPES[mime]
  if (extension === undefined) return yield* new Invalid({ fields: { file: "type" } })
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_RESOURCE_BYTES) {
    return yield* new Invalid({ fields: { file: "size" } })
  }
  // What the file is, by its first bytes: a type named in a header is only a claim.
  if (!looksLike(mime, input.bytes)) return yield* new Invalid({ fields: { file: "type" } })
  const title = input.title.trim().slice(0, 120)
  if (title === "") return yield* new Invalid({ fields: { title: "required" } })
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [count] = yield* sql<{ n: number }>`
        select count(*)::int as n from affiliate_resources where archived_at is null`
      if ((count?.n ?? 0) >= 200) return yield* new Invalid({ fields: { file: "count" } })
      const fileId = mintId("fil")
      const id = mintId("ars")
      const key = `${principal.workspaceId}/affiliates/resources/${id}.${extension}`
      const fileName = input.name.slice(0, 200) || `${title}.${extension}`
      yield* Effect.flatMap(Effect.service(FileStore), (files) => files.put(key, input.bytes, mime)).pipe(Effect.orDie)
      yield* sql`insert into files (id, workspace_id, r2_key, name, mime, size_bytes, kind, owner_type, owner_id,
                                    uploaded_by)
                 values (${fileId}, ${principal.workspaceId}, ${key}, ${fileName},
                         ${mime}, ${input.bytes.byteLength}, 'affiliate_resource', 'affiliate_resource', ${id},
                         ${principal.id})`
      yield* sql`insert into affiliate_resources (id, workspace_id, kind, title, file_id, r2_key, file_name, mime,
                                                  size_bytes, published_by)
                 values (${id}, ${principal.workspaceId}, ${input.kind}, ${title}, ${fileId}, ${key}, ${fileName},
                         ${mime}, ${input.bytes.byteLength}, ${principal.id})`
      yield* audit(sql, "affiliate.resource_added", "affiliate_resource", id, { title })
      return { id }
    })
  )
})

export const removeResource = Effect.fn("Affiliates.removeResource")(function*(resourceId: string) {
  yield* Policy.require("affiliates", 2)
  yield* everyStore
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [r] = yield* sql<{ id: string }>`
        update affiliate_resources set archived_at = now() where id = ${resourceId} and archived_at is null
        returning id`
      if (r === undefined) return yield* new NotFound({ entity: "affiliate_resource", id: resourceId })
      yield* audit(sql, "affiliate.resource_removed", "affiliate_resource", r.id)
      const undo = yield* Undo.issue(sql, { command: RESTORE, compensation: { kind: "resource", resourceId: r.id } })
      return new AffiliatesChange({ ids: [r.id], undo })
    })
  )
})

/** A resource's file, for the member side or the affiliate (each reads only its own workspace's, by RLS). */
export const resourceFile = (sql: SqlClient.SqlClient, resourceId: string) =>
  Effect.map(
    sql<{ r2Key: string; name: string; mime: string }>`
      select r.r2_key, r.file_name as name, r.mime from affiliate_resources r
      where r.id = ${resourceId} and r.archived_at is null`,
    ([row]) => row
  )

import { Db } from "@insyte/database/Db"
import { Invalid } from "@insyte/domain/Errors"
import { mintId, type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect, Redacted } from "effect"
import type { SqlClient } from "effect/sql"
import { FileStore } from "../../shared/domain/Documents.ts"
import { PendingEvents } from "../../shared/domain/Outbox.ts"
import { Sealer } from "../../shared/domain/Sealer.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import {
  DeliverableMissing,
  IllegalCheckMove,
  LinkExpired,
  type QualityCheckRow,
  type SubmitInput,
  SupplierCheck
} from "../domain/Quality.ts"

/*
 * A quality check answered by its supplier through the signed link (M9.4), until the partner portal (M16). The supplier
 * is no principal: the sealed token names the workspace and the check, and everything runs there as `system`. The
 * supplier sees what was asked, why an earlier answer was rejected, uploads photos and a video, and sends them with
 * the batch number; the team hears of it (`quality_check.submitted`). A rejected check can be answered again.
 */

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_VIDEO_BYTES = 50 * 1024 * 1024
const UPLOADS_PER_CHECK = 40
const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm"
}

interface Claims {
  readonly workspaceId: WorkspaceId
  readonly checkId: string
}

/** What a link names, while it is good. Tampered, sealed elsewhere or past its time, it is expired. */
export const openLink = Effect.fn("Quality.openLink")(function*(token: string) {
  const plain = yield* Effect.flatMap(Effect.service(Sealer), (s) => s.open(token)).pipe(
    Effect.mapError(() => new LinkExpired())
  )
  const claims = yield* Effect.try({
    try: () => JSON.parse(Redacted.value(plain)) as { w?: unknown; c?: unknown; x?: unknown },
    catch: () => new LinkExpired()
  })
  if (typeof claims.w !== "string" || typeof claims.c !== "string" || typeof claims.x !== "number") {
    return yield* new LinkExpired()
  }
  if (claims.x < Date.now()) return yield* new LinkExpired()
  return { workspaceId: claims.w as WorkspaceId, checkId: claims.c } satisfies Claims
})

const inWorkspace = <A, E, R>(workspaceId: WorkspaceId, f: (sql: SqlClient.SqlClient) => Effect.Effect<A, E, R>) =>
  Effect.flatMap(Effect.service(Db), (db) => db.scopedFor(f)).pipe(
    Effect.provideService(CurrentWorkspace, { id: workspaceId })
  )

/** The store's name as the supplier knows it: the workspace's one store's, else the workspace's. */
const brandName = (sql: SqlClient.SqlClient) =>
  Effect.gen(function*() {
    const stores = yield* sql<{ name: string }>`
      select name from stores where status <> 'disconnected' order by created_at limit 2`
    if (stores.length === 1) return stores[0]!.name
    const [ws] = yield* sql<{ name: string }>`select name from workspaces where id = app_workspace_id()`
    return ws?.name ?? ""
  })

/** The link's page: what was asked, by when, and why an earlier answer was not good enough. */
export const check = Effect.fn("Quality.supplierCheck")(function*(token: string) {
  const claims = yield* openLink(token)
  return yield* inWorkspace(claims.workspaceId, (sql) =>
    Effect.gen(function*() {
      const [c] = yield* sql<{
        kind: QualityCheckRow["kind"]
        variants: ReadonlyArray<string>
        deliverables: ReadonlyArray<QualityCheckRow["deliverables"][number]>
        dueAt: Date
        status: QualityCheckRow["status"]
        note: string
        submittedAt: Date | null
        decisionNote: string | null
        productTitle: string
        productImage: string | null
        supplierName: string
      }>`
        select q.kind, q.variants, q.deliverables, q.due_at, q.status, q.note, q.submitted_at, q.decision_note,
               p.title as product_title, p.images[1] as product_image, s.name as supplier_name
        from quality_checks q join products p on p.id = q.product_id join suppliers s on s.id = q.supplier_id
        where q.id = ${claims.checkId}`
      if (c === undefined) return yield* new LinkExpired()
      return new SupplierCheck({
        brand: yield* brandName(sql),
        productTitle: c.productTitle,
        productImage: c.productImage,
        supplierName: c.supplierName,
        kind: c.kind,
        variants: c.variants,
        deliverables: c.deliverables,
        dueAt: c.dueAt.getTime(),
        status: c.status,
        note: c.note,
        submittedAt: c.submittedAt?.getTime() ?? null,
        rejection: c.status === "rejected" ? c.decisionNote : null
      })
    }))
})

/** A photo or a video for the answer (`PUT /api/quality/media`), kept against the check until it is sent. */
export const upload = Effect.fn("Quality.supplierUpload")(function*(input: {
  readonly token: string
  readonly name: string
  readonly mime: string
  readonly bytes: Uint8Array
}) {
  const claims = yield* openLink(input.token)
  const mime = input.mime.toLowerCase()
  const extension = TYPES[mime]
  if (extension === undefined) return yield* new Invalid({ fields: { file: "type" } })
  const max = mime.startsWith("video/") ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > max) {
    return yield* new Invalid({ fields: { file: "size" } })
  }
  return yield* inWorkspace(claims.workspaceId, (sql) =>
    Effect.gen(function*() {
      const [c] = yield* sql<{ status: QualityCheckRow["status"] }>`
        select status from quality_checks where id = ${claims.checkId}`
      if (c === undefined) return yield* new LinkExpired()
      if (c.status !== "requested" && c.status !== "rejected") {
        return yield* new IllegalCheckMove({ id: claims.checkId, from: c.status, move: "submit" })
      }
      const [count] = yield* sql<{ n: number }>`
        select count(*)::int as n from files where owner_type = 'quality_check' and owner_id = ${claims.checkId}`
      if ((count?.n ?? 0) >= UPLOADS_PER_CHECK) return yield* new Invalid({ fields: { file: "count" } })
      const id = mintId("fil")
      const key = `${claims.workspaceId}/quality/${claims.checkId}/${id}.${extension}`
      // A bucket that does not take the file is a defect, as a database that does not answer.
      yield* Effect.flatMap(Effect.service(FileStore), (files) => files.put(key, input.bytes, mime)).pipe(Effect.orDie)
      yield* sql`insert into files (id, workspace_id, r2_key, name, mime, size_bytes, kind, owner_type, owner_id,
                                    uploaded_by)
                 values (${id}, ${claims.workspaceId}, ${key}, ${input.name.slice(0, 200) || `bestand.${extension}`},
                         ${mime}, ${input.bytes.byteLength}, 'quality_media', 'quality_check', ${claims.checkId},
                         'supplier')`
      return { id }
    }))
})

/** "Controle insturen": the photos, the video, the batch number and a note; what the check asks for must be there. */
export const submit = Effect.fn("Quality.supplierSubmit")(function*(input: typeof SubmitInput.Type) {
  const claims = yield* openLink(input.token)
  return yield* inWorkspace(claims.workspaceId, (sql) =>
    Effect.gen(function*() {
      const [c] = yield* sql<{
        status: QualityCheckRow["status"]
        deliverables: ReadonlyArray<string>
        supplierName: string
      }>`
        select q.status, q.deliverables, s.name as supplier_name
        from quality_checks q join suppliers s on s.id = q.supplier_id
        where q.id = ${claims.checkId} for update of q`
      if (c === undefined) return yield* new LinkExpired()
      if (c.status !== "requested" && c.status !== "rejected") {
        return yield* new IllegalCheckMove({ id: claims.checkId, from: c.status, move: "submit" })
      }
      const fileIds = [...new Set(input.fileIds)]
      const files = fileIds.length === 0 ? [] : yield* sql<{ id: string; mime: string }>`
        select id, mime from files
        where id in ${sql.in(fileIds)} and owner_type = 'quality_check' and owner_id = ${claims.checkId}
          and deleted_at is null`
      if (files.length !== fileIds.length) return yield* new Invalid({ fields: { fileIds: "unknown" } })
      if (c.deliverables.includes("photos") && !files.some((f) => f.mime.startsWith("image/"))) {
        return yield* new DeliverableMissing({ what: "photos" })
      }
      const batch = input.batch?.trim() || null
      if (c.deliverables.includes("batch") && batch === null) return yield* new DeliverableMissing({ what: "batch" })

      yield* sql`delete from quality_check_media where check_id = ${claims.checkId}`
      for (const [position, id] of fileIds.entries()) {
        yield* sql`insert into quality_check_media (workspace_id, check_id, file_id, position)
                   values (${claims.workspaceId}, ${claims.checkId}, ${id}, ${position})`
      }
      yield* sql`
        update quality_checks set status = 'submitted', submitted_at = now(),
               submitted_by = ${input.by?.trim() || c.supplierName}, batch = ${batch},
               submission_note = ${input.note?.trim() || null},
               video = ${files.some((f) => f.mime.startsWith("video/"))},
               decided_at = null, decided_by = null, decision_note = null
        where id = ${claims.checkId}`
      yield* Audit.write(sql, claims.workspaceId, { kind: "system", id: "supplier-link" }, {
        action: "quality_check.submitted",
        subjectType: "quality_check",
        subjectId: claims.checkId,
        diff: { files: fileIds.length, batch: batch !== null }
      })
      const outboxId = yield* Outbox.write(sql, claims.workspaceId, {
        type: "quality_check.submitted",
        workspaceId: claims.workspaceId,
        userId: "system",
        checkIds: [claims.checkId]
      })
      ;(yield* PendingEvents)?.add(outboxId)
      return { submittedAt: Date.now() }
    }))
})

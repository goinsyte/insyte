import { Db } from "@insyte/database/Db"
import { Invalid, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import { FileStore } from "../../shared/domain/Documents.ts"
import { CaseClosed } from "../domain/Chargebacks.ts"
import { caseScope } from "./chargebacks.ts"

/*
 * One file of evidence, uploaded for a case before it goes into the pack (M13 step 4; widgets/04 §E "Bewijs
 * toevoegen"): kept in R2 and in `files` as the case's, so `Chargebacks.addEvidence` can put it in. Up to ten
 * megabytes (api.md §5), a PDF, an image, a mail or plain text. There is no presigned upload in the platform yet, so the
 * console sends the bytes through the session's own route, as the supplier's quality photos go.
 */

export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024

const TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "text/plain": "txt",
  "text/csv": "csv",
  "message/rfc822": "eml"
}

export const uploadEvidence = Effect.fn("Chargebacks.uploadEvidence")(function*(input: {
  readonly chargebackId: string
  readonly name: string
  readonly mime: string
  readonly bytes: Uint8Array
}) {
  yield* Policy.require("chargebacks", 2)
  const mime = input.mime.toLowerCase().split(";")[0]!.trim()
  const extension = TYPES[mime]
  if (extension === undefined) return yield* new Invalid({ fields: { file: "type" } })
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_EVIDENCE_BYTES) {
    return yield* new Invalid({ fields: { file: "size" } })
  }
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* caseScope(sql)
      const [c] = yield* sql<{ status: CaseClosed["status"] }>`
        select c.status from chargebacks c where c.id = ${input.chargebackId} and ${scope}`
      if (c === undefined) return yield* new NotFound({ entity: "chargeback", id: input.chargebackId })
      if (c.status !== "open" && c.status !== "awaiting_evidence") {
        return yield* new CaseClosed({ id: input.chargebackId, status: c.status })
      }
      const id = mintId("fil")
      const key = `${principal.workspaceId}/evidence/${input.chargebackId}/${id}.${extension}`
      // A bucket that does not take the file is a defect, as a database that does not answer.
      yield* Effect.flatMap(Effect.service(FileStore), (files) => files.put(key, input.bytes, mime)).pipe(Effect.orDie)
      const name = input.name.trim().slice(0, 200) || `bewijs.${extension}`
      yield* sql`insert into files (id, workspace_id, r2_key, name, mime, size_bytes, kind, owner_type, owner_id,
                                    uploaded_by)
                 values (${id}, ${principal.workspaceId}, ${key}, ${name}, ${mime}, ${input.bytes.byteLength},
                         'evidence', 'chargeback', ${input.chargebackId}, ${principal.id})`
      return { id, name, sizeBytes: input.bytes.byteLength }
    })
  )
})

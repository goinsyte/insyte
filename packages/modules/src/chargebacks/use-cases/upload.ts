import { Db } from "@insyte/database/Db"
import { Invalid, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import { cleanFileName, FileStore } from "../../shared/domain/Documents.ts"
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

/** What the first bytes say a file is, for the types that say it; `undefined` for text, a mail or anything else. */
const sniff = (bytes: Uint8Array): string | undefined => {
  const at = (offset: number, ...signature: Array<number>) => signature.every((b, i) => bytes[offset + i] === b)
  if (at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf" // %PDF-
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png"
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg"
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp" // RIFF....WEBP
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return "image/gif" // GIF8
  if (at(4, 0x66, 0x74, 0x79, 0x70)) return "image/heic" // ....ftyp
  return undefined
}

/**
 * The type a file claims must be the one its bytes show: a PDF, an image, each by its signature; a text, a CSV or a mail
 * is not one of those. A file that says otherwise is refused, not stored under a type it is not.
 */
const matches = (mime: string, bytes: Uint8Array) => {
  const found = sniff(bytes)
  return mime.startsWith("text/") || mime === "message/rfc822" ? found === undefined : found === mime
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
  if (!matches(mime, input.bytes)) return yield* new Invalid({ fields: { file: "type" } })
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
      const name = Array.from(cleanFileName(input.name).trim()).slice(0, 200).join("").trim() || `bewijs.${extension}`
      yield* sql`insert into files (id, workspace_id, r2_key, name, mime, size_bytes, kind, owner_type, owner_id,
                                    uploaded_by)
                 values (${id}, ${principal.workspaceId}, ${key}, ${name}, ${mime}, ${input.bytes.byteLength},
                         'evidence', 'chargeback', ${input.chargebackId}, ${principal.id})`
      return { id, name, sizeBytes: input.bytes.byteLength }
    })
  )
})

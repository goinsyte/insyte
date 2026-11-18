import { Db } from "@insyte/database/Db"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { CurrentUser } from "@insyte/domain/Session"
import { ResourceKind } from "@insyte/modules/affiliates/domain/Affiliates"
import { withAffiliates } from "@insyte/modules/affiliates/lazy"
import { cleanFileName, FileStore } from "@insyte/modules/shared/domain/Documents"
import { Effect, Option, Schema } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../platform/RequestDb.ts"
import { userFrom } from "../../platform/Sessions.ts"
import { activeMemberOf, MISMATCH, workspaceMismatch } from "./ActiveMember.ts"

const MAX_BYTES = 25 * 1024 * 1024

const refusal = (status: number, code: string, extra: Record<string, unknown> = {}) =>
  HttpServerResponse.jsonUnsafe({ error: { code, ...extra } }, { status })

const notFound = refusal(404, "not_found")

const header = (headers: Headers, name: string) => {
  try {
    return decodeURIComponent(headers.get(name) ?? "")
  } catch {
    return ""
  }
}

/** Inline only what a browser shows without running it: an image (not SVG) or a PDF. */
const PREVIEW = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"])

const disposition = (name: string, as: "inline" | "attachment") => {
  const clean = cleanFileName(name)
  const ascii = clean.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || "bestand"
  const encoded = encodeURIComponent(clean).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  return `${as}; filename="${ascii}"; filename*=UTF-8''${encoded}`
}

/**
 * The body's bytes, or \`null\` once they pass \`max\`: read as a stream and cancelled there, whatever
 * \`content-length\` said (a chunked upload names none).
 */
const readCapped = async (body: ReadableStream<Uint8Array> | null, max: number): Promise<Uint8Array | null> => {
  if (body === null) return new Uint8Array()
  const reader = body.getReader()
  const chunks: Array<Uint8Array> = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let at = 0
  for (const chunk of chunks) {
    bytes.set(chunk, at)
    at += chunk.byteLength
  }
  return bytes
}

const stream = (file: { readonly r2Key: string; readonly name: string; readonly mime: string }, download: boolean) =>
  Effect.gen(function*() {
    const stored = yield* Effect.flatMap(Effect.service(FileStore), (s) => s.open(file.r2Key))
    if (stored === undefined) return notFound
    const inline = !download && PREVIEW.has(file.mime)
    return HttpServerResponse.raw(stored.body, {
      contentType: file.mime,
      contentLength: stored.size,
      headers: {
        "content-disposition": disposition(file.name, inline ? "inline" : "attachment"),
        "cache-control": "private, no-store",
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "x-content-type-options": "nosniff"
      }
    })
  })

export const upload = Effect.gen(function*() {
  const request = yield* HttpServerRequest.HttpServerRequest
  const headers = new Headers(request.headers as Record<string, string>)
  const user = yield* userFrom(headers)
  if (Option.isNone(user)) return refusal(401, "unauthenticated")
  if (Number(headers.get("content-length") ?? 0) > MAX_BYTES) return refusal(413, "too_large")
  const active = yield* activeMemberOf(user.value, headers)
  if (active === MISMATCH) return workspaceMismatch()
  if (active === undefined) return notFound
  const kind = Schema.decodeUnknownOption(ResourceKind)(headers.get("x-resource-kind") ?? "")
  if (Option.isNone(kind)) return refusal(422, "invalid", { fields: { kind: "unknown" } })
  const web = yield* HttpServerRequest.toWeb(request)
  const bytes = yield* Effect.promise(() => readCapped(web.body, MAX_BYTES))
  if (bytes === null) return refusal(413, "too_large")
  return yield* withAffiliates((m) =>
    m.operator.uploadResource({
      title: header(headers, "x-resource-title"),
      kind: kind.value,
      name: header(headers, "x-file-name"),
      mime: headers.get("content-type") ?? "",
      bytes
    })
  ).pipe(
    Effect.map(({ id }) => HttpServerResponse.jsonUnsafe({ id }, { status: 201 })),
    Effect.provideService(CurrentPrincipal, active.principal),
    Effect.catchTags({
      Forbidden: () => Effect.succeed(refusal(403, "forbidden")),
      Invalid: (e) =>
        Effect.succeed(
          e.fields["file"] === "type"
            ? refusal(415, "unsupported_type")
            : e.fields["file"] === "size"
            ? refusal(413, "too_large")
            : refusal(422, "invalid", { fields: e.fields })
        )
    })
  )
}).pipe(withRequestDb, Effect.withSpan("Affiliates.uploadRoute"))

export const memberDownload = Effect.gen(function*() {
  const request = yield* HttpServerRequest.HttpServerRequest
  const { id = "" } = yield* HttpRouter.params
  const headers = new Headers(request.headers as Record<string, string>)
  const user = yield* userFrom(headers)
  if (Option.isNone(user)) return refusal(401, "unauthenticated")
  const active = yield* activeMemberOf(user.value, headers)
  if (active === MISMATCH) return workspaceMismatch()
  if (active === undefined) return notFound
  const db = yield* Db
  const file = yield* Effect.gen(function*() {
    yield* Policy.require("affiliates", 1)
    return yield* db.scoped((sql) => withAffiliates((m) => m.resourceFile(sql, id)))
  }).pipe(
    Effect.provideService(CurrentPrincipal, active.principal),
    Effect.catchTag("Forbidden", () => Effect.succeed(undefined))
  )
  if (file === undefined) return notFound
  return yield* stream(file, new URL(request.url, "http://x").searchParams.get("download") === "1")
}).pipe(Effect.orDie, withRequestDb, Effect.withSpan("Affiliates.memberDownloadRoute"))

/** As the affiliate itself (`Db.scopedPartner`): a resource of another brand, or one taken down, is not found. */
export const affiliateDownload = Effect.gen(function*() {
  const request = yield* HttpServerRequest.HttpServerRequest
  const { id = "" } = yield* HttpRouter.params
  const headers = new Headers(request.headers as Record<string, string>)
  const user = yield* userFrom(headers)
  if (Option.isNone(user)) return refusal(401, "unauthenticated")
  const db = yield* Db
  const [held] = yield* withAffiliates((m) => m.applicant.held()).pipe(Effect.provideService(CurrentUser, user.value))
  if (held === undefined) return notFound
  const file = yield* db.scopedPartner((sql) => withAffiliates((m) => m.resourceFile(sql, id))).pipe(
    Effect.provideService(CurrentPrincipal, held.principal)
  )
  if (file === undefined) return notFound
  return yield* stream(file, new URL(request.url, "http://x").searchParams.get("download") === "1")
}).pipe(Effect.orDie, withRequestDb, Effect.withSpan("Affiliates.affiliateDownloadRoute"))

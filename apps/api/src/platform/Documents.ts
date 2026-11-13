import { DocumentNotMade, Documents, FileStore } from "@insyte/modules/shared/domain/Documents"
import { env } from "cloudflare:workers"
import { Config, Effect, Layer } from "effect"

/*
 * Documents (M8.5): a packing slip as a PDF through Browser Rendering (`BROWSER`, its `pdf` quick action on the HTML),
 * or, where the stage says `DOCUMENTS_ADAPTER=html` (the worker tests, which have no browser), the HTML as it is. Files
 * in the stage's R2 bucket (`FILES`).
 */

const BrowserPdf = Layer.succeed(Documents)(Documents.of({
  render: (html) =>
    Effect.tryPromise({
      try: async () => {
        const response = await env.BROWSER.quickAction("pdf", {
          html,
          pdfOptions: { format: "a4", printBackground: true, margin: { top: "16mm", bottom: "16mm" } }
        })
        if (!response.ok) throw new Error(`browser ${response.status}: ${(await response.text()).slice(0, 200)}`)
        return new Uint8Array(await response.arrayBuffer())
      },
      catch: (cause) => new DocumentNotMade({ reason: String(cause) })
    }).pipe(Effect.map((bytes) => ({ bytes, mime: "application/pdf" as const, extension: "pdf" as const })))
}))

const HtmlOnly = Layer.succeed(Documents)(Documents.of({
  render: (html) =>
    Effect.succeed({ bytes: new TextEncoder().encode(html), mime: "text/html" as const, extension: "html" as const })
}))

export const DocumentsChoice = Layer.unwrap(
  Effect.map(
    Config.String("DOCUMENTS_ADAPTER").pipe(Config.withDefault("browser")),
    (adapter) => (adapter === "html" ? HtmlOnly : BrowserPdf)
  )
)

const r2 = <A>(what: string, run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: (cause) => new DocumentNotMade({ reason: `r2 ${what}: ${String(cause)}` }) })

export const FileStoreR2 = Layer.succeed(FileStore)(FileStore.of({
  // Best effort: an object the bucket keeps after a failed delete holds nothing a files row still points at.
  remove: (keys) =>
    keys.length === 0 ? Effect.void : Effect.promise(() => env.FILES.delete([...keys]).catch(() => undefined)),
  removePrefix: (prefix) =>
    Effect.promise(async () => {
      let removed = 0
      let cursor: string | undefined
      do {
        const page = await env.FILES.list({ prefix, ...(cursor === undefined ? {} : { cursor }) })
        const keys = page.objects.map((o) => o.key)
        if (keys.length > 0) await env.FILES.delete(keys).catch(() => undefined)
        removed += keys.length
        cursor = page.truncated ? page.cursor : undefined
      } while (cursor !== undefined)
      return removed
    }),
  begin: (key, mime) =>
    r2("begin", () => env.FILES.createMultipartUpload(key, { httpMetadata: { contentType: mime } })).pipe(
      Effect.map((upload) => upload.uploadId)
    ),
  putPart: (key, uploadId, partNumber, bytes) =>
    r2("part", () => env.FILES.resumeMultipartUpload(key, uploadId).uploadPart(partNumber, bytes)).pipe(
      Effect.map((part) => ({ partNumber: part.partNumber, etag: part.etag }))
    ),
  complete: (key, uploadId, parts) =>
    r2("complete", () => env.FILES.resumeMultipartUpload(key, uploadId).complete([...parts])).pipe(Effect.asVoid),
  // An upload never completed is dropped by the bucket after a week anyway.
  abandon: (key, uploadId) =>
    Effect.promise(() => env.FILES.resumeMultipartUpload(key, uploadId).abort().catch(() => undefined)),
  put: (key, bytes, mime) =>
    Effect.tryPromise({
      try: () => env.FILES.put(key, bytes, { httpMetadata: { contentType: mime } }),
      catch: (cause) => new DocumentNotMade({ reason: `r2: ${String(cause)}` })
    }).pipe(Effect.asVoid),
  get: (key) =>
    Effect.promise(async () => {
      const object = await env.FILES.get(key)
      if (object === null) return undefined
      return {
        bytes: new Uint8Array(await object.arrayBuffer()),
        mime: object.httpMetadata?.contentType ?? "application/octet-stream"
      }
    })
}))

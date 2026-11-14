import { DocumentNotMade, Documents, FileParts, FileStore } from "@insyte/modules/shared/domain/Documents"
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
    }),
  open: (key) =>
    Effect.promise(async () => {
      const object = await env.FILES.get(key)
      if (object === null) return undefined
      return {
        body: object.body,
        size: object.size,
        mime: object.httpMetadata?.contentType ?? "application/octet-stream"
      }
    })
}))

/**
 * An export's parts into one file (M14 step 5): streamed through a fixed-length stream, part after part, so the Worker
 * never holds more than one; the bucket learns the length up front, as R2 needs for a stream. A file already at `key`
 * with the parts' total size is the same join done before, and is kept. One `get` per part and one `put`: at the
 * Workflow's 500 pages, about a thousand subrequests, inside a Workflow's 10,000.
 */
export const FilePartsR2 = Layer.succeed(FileParts)(FileParts.of({
  join: (key, parts, mime) =>
    Effect.tryPromise({
      try: async () => {
        const size = parts.reduce((n, p) => n + p.size, 0)
        const there = await env.FILES.head(key)
        if (there !== null && there.size === size) return { sizeBytes: size }
        const { readable, writable } = new FixedLengthStream(size)
        const pump = (async () => {
          for (const part of parts) {
            const object = await env.FILES.get(part.key)
            if (object === null || object.size !== part.size) throw new Error(`part ${part.key} is missing`)
            await object.body.pipeTo(writable, { preventClose: true })
          }
          await writable.close()
        })()
        const put = env.FILES.put(key, readable, { httpMetadata: { contentType: mime } })
        // A part that is missing aborts the stream, so the put fails too and no short file is kept.
        await Promise.all([
          put,
          pump.catch(async (cause) => {
            await writable.abort(cause).catch(() => undefined)
            throw cause
          })
        ])
        return { sizeBytes: size }
      },
      catch: (cause) => new DocumentNotMade({ reason: `r2: ${String(cause)}` })
    }),
  clear: (prefix) =>
    Effect.tryPromise({
      try: async () => {
        let removed = 0
        let cursor: string | undefined
        do {
          const page = await env.FILES.list({ prefix, ...(cursor === undefined ? {} : { cursor }) })
          const keys = page.objects.map((o) => o.key)
          if (keys.length > 0) await env.FILES.delete(keys)
          removed += keys.length
          cursor = page.truncated ? page.cursor : undefined
        } while (cursor !== undefined)
        return removed
      },
      catch: (cause) => new DocumentNotMade({ reason: `r2: ${String(cause)}` })
    })
}))

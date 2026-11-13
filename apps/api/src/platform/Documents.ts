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

export const FileStoreR2 = Layer.succeed(FileStore)(FileStore.of({
  // Best effort: an object the bucket keeps after a failed delete holds nothing a files row still points at.
  remove: (keys) =>
    keys.length === 0 ? Effect.void : Effect.promise(() => env.FILES.delete([...keys]).catch(() => undefined)),
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

/**
 * An export's parts into one file (M14 step 5): streamed through a fixed-length stream, part after part, so the Worker
 * never holds more than one; the bucket learns the length up front, as R2 needs for a stream. The parts go after.
 */
export const FilePartsR2 = Layer.succeed(FileParts)(FileParts.of({
  join: (key, parts, mime) =>
    Effect.tryPromise({
      try: async () => {
        const heads = await Promise.all(parts.map((p) => env.FILES.head(p)))
        const missing = heads.findIndex((h) => h === null)
        if (missing !== -1) throw new Error(`part ${parts[missing]} is missing`)
        const size = heads.reduce((n, h) => n + (h?.size ?? 0), 0)
        const { readable, writable } = new FixedLengthStream(size)
        const pump = (async () => {
          for (const part of parts) {
            const object = await env.FILES.get(part)
            if (object === null) throw new Error(`part ${part} is missing`)
            await object.body.pipeTo(writable, { preventClose: true })
          }
          await writable.close()
        })()
        await Promise.all([env.FILES.put(key, readable, { httpMetadata: { contentType: mime } }), pump])
        if (parts.length > 0) await env.FILES.delete([...parts]).catch(() => undefined)
        return { sizeBytes: size }
      },
      catch: (cause) => new DocumentNotMade({ reason: `r2: ${String(cause)}` })
    })
}))

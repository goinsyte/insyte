import { Context, type Effect, Schema } from "effect"

/*
 * Documents (M8.5): a page of HTML made into a file to print (a packing slip), and files kept (R2), as ports. The API
 * Worker renders with Browser Rendering; the worker tests, which have no browser, keep the HTML itself.
 */

export class DocumentNotMade extends Schema.TaggedError<DocumentNotMade>()("DocumentNotMade", {
  reason: Schema.String
}) {}

export class Documents extends Context.Service<Documents, {
  /** The page as a file: a PDF where a browser renders it, else the HTML as it is. */
  readonly render: (html: string) => Effect.Effect<
    { readonly bytes: Uint8Array; readonly mime: "application/pdf" | "text/html"; readonly extension: "pdf" | "html" },
    DocumentNotMade
  >
}>()("shared/Documents") {}

export class FileStore extends Context.Service<FileStore, {
  readonly put: (key: string, bytes: Uint8Array, mime: string) => Effect.Effect<void, DocumentNotMade>
  readonly get: (key: string) => Effect.Effect<{ readonly bytes: Uint8Array; readonly mime: string } | undefined>
  /** Gone for good, as far as the bucket can say: a key that is not there is no failure. */
  readonly remove: (keys: ReadonlyArray<string>) => Effect.Effect<void>
}>()("shared/FileStore") {}

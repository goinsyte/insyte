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

/**
 * A file written in parts (an export, M14 step 5): each part is an object of its own, and `join` streams them into one
 * file at `key`, in order, without holding more than one part at a time; the parts are then removed. Its size back.
 */
export class FileParts extends Context.Service<FileParts, {
  readonly join: (
    key: string,
    parts: ReadonlyArray<string>,
    mime: string
  ) => Effect.Effect<{ readonly sizeBytes: number }, DocumentNotMade>
}>()("shared/FileParts") {}

/**
 * A file's name as typed, without control characters, quotes, backslashes or a lone half of a character, so no header
 * it goes into (`content-disposition`) can break.
 */
export const cleanFileName = (name: string) =>
  Array.from(name).filter((ch) => {
    const c = ch.codePointAt(0) ?? 0
    return c > 0x1f && c !== 0x7f && ch !== "\"" && ch !== "\\" && (c < 0xd800 || c > 0xdfff)
  }).join("")

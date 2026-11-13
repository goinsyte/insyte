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

/** A part of a file written in parts, as the bucket acknowledged it. */
export interface UploadedPart {
  readonly partNumber: number
  readonly etag: string
}

export class FileStore extends Context.Service<FileStore, {
  readonly put: (key: string, bytes: Uint8Array, mime: string) => Effect.Effect<void, DocumentNotMade>
  readonly get: (key: string) => Effect.Effect<{ readonly bytes: Uint8Array; readonly mime: string } | undefined>
  /** The object as a stream with its size, for a download that should not hold the whole file. */
  readonly open: (key: string) => Effect.Effect<
    { readonly body: ReadableStream<Uint8Array>; readonly size: number; readonly mime: string } | undefined
  >
  /** Gone for good, as far as the bucket can say: a key that is not there is no failure. */
  readonly remove: (keys: ReadonlyArray<string>) => Effect.Effect<void>
  /** Every object whose key starts with `prefix`, gone as `remove` goes. Answers how many there were. */
  readonly removePrefix: (prefix: string) => Effect.Effect<number>
  /**
   * A file too large to hold in memory, written in parts (R2 multipart): begun, each part but the last of one size,
   * then completed from the parts' acknowledgements; or abandoned. A part sent again under its number replaces it.
   */
  readonly begin: (key: string, mime: string) => Effect.Effect<string, DocumentNotMade>
  readonly putPart: (
    key: string,
    uploadId: string,
    partNumber: number,
    bytes: Uint8Array
  ) => Effect.Effect<UploadedPart, DocumentNotMade>
  readonly complete: (
    key: string,
    uploadId: string,
    parts: ReadonlyArray<UploadedPart>
  ) => Effect.Effect<void, DocumentNotMade>
  readonly abandon: (key: string, uploadId: string) => Effect.Effect<void>
}>()("shared/FileStore") {}

/**
 * A file written in parts (an export, M14 step 5): each part is an object of its own, and `join` streams them into one
 * file at `key`, in order, without holding more than one part at a time. A `join` tried again finds the file already
 * there at the parts' total size and leaves it, so it is safe to retry; the parts stay until `clear` takes them.
 */
export class FileParts extends Context.Service<FileParts, {
  readonly join: (
    key: string,
    parts: ReadonlyArray<{ readonly key: string; readonly size: number }>,
    mime: string
  ) => Effect.Effect<{ readonly sizeBytes: number }, DocumentNotMade>
  /**
   * Every object under `prefix` gone, and how many. Unlike `FileStore.remove`, a delete the bucket refuses is a failure,
   * so the step or the sweep that asked tries again rather than leaving a file behind.
   */
  readonly clear: (prefix: string) => Effect.Effect<number, DocumentNotMade>
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

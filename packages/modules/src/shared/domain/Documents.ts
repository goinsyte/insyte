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
 * A file's name as typed, without control characters, quotes, backslashes or a lone half of a character, so no header
 * it goes into (`content-disposition`) can break.
 */
export const cleanFileName = (name: string) =>
  Array.from(name).filter((ch) => {
    const c = ch.codePointAt(0) ?? 0
    return c > 0x1f && c !== 0x7f && ch !== "\"" && ch !== "\\" && (c < 0xd800 || c > 0xdfff)
  }).join("")

import type { ArticleVersion } from "@insyte/ui/app/lib/knowledge"

/**
 * The drawer's versions with their own texts, from one `Knowledge.versions` read. Matched by number, not place: the
 * read holds the newest hundred. A version the read lacks keeps what the chapter carried for it.
 */
export const withTexts = (
  known: ReadonlyArray<ArticleVersion>,
  read: ReadonlyArray<{ readonly version: number; readonly body: string }>
): ReadonlyArray<ArticleVersion> => {
  const body = new Map(read.map((v) => [v.version, v.body]))
  return known.map((v) => {
    const text = body.get(v.n)
    return text === undefined ? v : { ...v, body: text }
  })
}

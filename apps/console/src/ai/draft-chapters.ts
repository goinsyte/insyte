import type { Draft } from "@insyte/modules/ai/domain/Ai"

/**
 * The Kennisbank chapters a reply draft answers from, as the inbox's draft card links them (`ThreadDraft.chapters`):
 * one each, to the chapter's page; none when the draft cited none.
 */
export const chaptersOf = (
  draft: Pick<Draft, "sources"> | null
): ReadonlyArray<{ readonly title: string; readonly to: string }> | undefined => {
  const sources = draft?.sources ?? []
  if (sources.length === 0) return undefined
  const seen = new Set<string>()
  return sources.flatMap((s) => {
    if (seen.has(s.articleId)) return []
    seen.add(s.articleId)
    return [{ title: s.title, to: `/settings/ai/knowledge/${encodeURIComponent(s.articleId)}` }]
  })
}

import type { SearchResult } from "@insyte/modules/knowledge/domain/Knowledge"
import type { Published } from "@insyte/modules/knowledge/use-cases/articles"

/* Kennisbank in the public shape: a published chapter, the list, and a search's pieces. */

const summaryV1 = (p: Published) => ({
  id: p.id,
  title: p.title,
  audience: p.audience,
  store_id: p.storeId,
  version: p.version,
  length: p.length,
  published_at: p.publishedAt.toISOString()
})

export const articleListV1 = (rows: ReadonlyArray<Published>) => ({ data: rows.map(summaryV1) })

export const articleV1 = (p: Published) => ({ ...summaryV1(p), body: p.body ?? "" })

export const searchV1 = (r: SearchResult) => ({
  data: r.hits.map((h) => ({
    article_id: h.articleId,
    version: h.version,
    title: h.title,
    text: h.text,
    score: h.score
  })),
  mode: r.mode
})

import { mintId } from "@insyte/domain/Ids"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient, SqlError } from "effect/sql"
import { inScopeOrNone } from "../../shared/use-cases/StoreScope.ts"
import { vectorLiteral } from "../domain/Chunks.ts"
import { Embedder, type EmbedderApi, type Hit, type SearchInput, SearchResult } from "../domain/Knowledge.ts"

/*
 * Reading the knowledge base (M15 step 7; ai.md §11): the published chapters' pieces that answer a question, by meaning
 * where the stage has an embedder (pgvector's HNSW, cosine, `bge-m3`) and by words where it has none or a piece is not
 * embedded yet (Postgres' Dutch full-text search). Only a published version is read, never a draft or an archived
 * chapter; always the workspace's own (row level security and the query's own predicate) and within the principal's
 * stores. The best piece per chapter, the best chapters first.
 *
 * What it returns is the operator's text: an answer quotes it inside a data block, as a source, never as instructions.
 *
 * An embedding is an AI call: it is metered (`model_calls`, purpose `embedding`) and not made when the month's budget is
 * spent, when the search reads by words instead.
 */

/** A transaction to run a step in (`db.scoped` on a request). */
export type InTx<R = never> = <A, E, X>(
  f: (sql: SqlClient.SqlClient) => Effect.Effect<A, E, X>
) => Effect.Effect<A, E | SqlError.SqlError, X | R>

/** The pieces a search looks at before keeping the best per chapter. */
const CANDIDATES = 24

const DEFAULT_LIMIT = 3

/** Tokens of a text, as the meter counts them without the provider's count: four characters of Dutch a token. */
const tokensOf = (texts: ReadonlyArray<string>) => Math.ceil(texts.reduce((n, t) => n + t.length, 0) / 4)

/** Whether the workspace's month still has room for an AI call (the agent's own limit aside). */
export const budgetLeft = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<{ spent: boolean }>`
      select coalesce(ai_month_used(null) >= b.monthly_limit_minor::bigint * 10000, false) as spent
      from (select 1) one left join ai_budgets b on b.member_id is null`,
    ([r]) => r === undefined || !r.spent
  )

/** One embedding call in `model_calls`: what it was, what it cost, how it ended. No text is kept. */
export const meter = (
  sql: SqlClient.SqlClient,
  embedder: EmbedderApi,
  call: {
    readonly texts: ReadonlyArray<string>
    readonly latencyMs: number
    readonly ok: boolean
    readonly subject: { readonly type: string; readonly id: string } | null
    /** Whose budget it counts against (`null`: background work) and who made it. */
    readonly memberId: string | null
    readonly principalKind: string
  }
) =>
  Effect.gen(function*() {
    const tokens = tokensOf(call.texts)
    yield* sql`insert into model_calls (id, workspace_id, member_id, principal_kind, purpose, prompt_id, prompt_version,
                                        provider, model, input_tokens, cost_micros, latency_ms, outcome, subject_type,
                                        subject_id)
               values (${mintId("mc")}, app_workspace_id(), ${call.memberId}, ${call.principalKind},
                       'embedding', 'knowledge_embedding', '1.0.0', ${embedder.provider}, ${embedder.model}, ${tokens},
                       ${Math.round(tokens * embedder.pricePerMillion)}, ${call.latencyMs},
                       ${call.ok ? "ok" : "error"}, ${call.subject?.type ?? null}, ${call.subject?.id ?? null})`
  })

/** The question's vector, or none: no embedder, the budget spent, or the embedder failed (logged). */
const queryVector = (inTx: InTx<CurrentPrincipal>, embedder: EmbedderApi, query: string) =>
  Effect.gen(function*() {
    if (!(yield* inTx(budgetLeft))) return null
    const p = yield* CurrentPrincipal
    const started = Date.now()
    const made = yield* Effect.result(embedder.embed([query]))
    const ok = made._tag === "Success"
    // The meter is best effort: a search is never refused for it.
    yield* inTx((sql) =>
      meter(sql, embedder, {
        texts: [query],
        latencyMs: Date.now() - started,
        ok,
        subject: null,
        memberId: p.kind === "member" ? p.id : null,
        principalKind: p.kind
      })
    )
      .pipe(Effect.catchCause((cause) => Effect.logWarning("an embedding was not metered", { cause })))
    if (!ok) {
      yield* Effect.logWarning("the knowledge base was searched by its words: the embedder failed", {
        reason: made.failure.reason
      })
      return null
    }
    return made.success[0] ?? null
  })

interface HitRow {
  readonly articleId: string
  readonly version: number
  readonly title: string
  readonly audience: Hit["audience"]
  readonly storeId: string | null
  readonly text: string
  readonly score: number
}

const audienceIn = (audience: SearchInput["audience"]) =>
  audience === "customer_agent"
    ? ["customer_agent", "both"]
    : audience === "assistant"
    ? ["assistant", "both"]
    : ["customer_agent", "assistant", "both"]

/** The pieces nearest the question's vector. */
const byMeaning = (sql: SqlClient.SqlClient, vector: ReadonlyArray<number>, audiences: ReadonlyArray<string>) =>
  Effect.gen(function*() {
    const scope = yield* inScopeOrNone(sql, "c.store_id")
    // Filtered HNSW (pgvector 0.8): keep scanning until enough rows pass the workspace's and the stores' filters.
    yield* sql`set local hnsw.iterative_scan = relaxed_order`
    const v = vectorLiteral(vector)
    return yield* sql<HitRow>`
      select c.article_id, c.version, c.title, c.audience, c.store_id, c.text, 1 - (c.embedding <=> ${v}::vector) as score
      from knowledge_chunks c
      join knowledge_articles a on a.id = c.article_id and a.archived_at is null and a.published_version = c.version
      where c.workspace_id = app_workspace_id() and c.embedding is not null
        and c.audience = any(${[...audiences]}::text[]) and ${scope}
      order by c.embedding <=> ${v}::vector
      limit ${CANDIDATES}`
  })

/**
 * The pieces that share words with the question (Dutch stems, stop words left out): at least two of them, or every one
 * when the question has fewer; more shared first. `unembedded` reads only the pieces the embedder has not reached.
 */
const byWords = (sql: SqlClient.SqlClient, query: string, audiences: ReadonlyArray<string>, unembedded: boolean) =>
  Effect.gen(function*() {
    const scope = yield* inScopeOrNone(sql, "c.store_id")
    return yield* sql<HitRow>`
      with q as (select array(select unnest(tsvector_to_array(to_tsvector('dutch'::regconfig, ${query})))) as words),
           tq as (select q.words, to_tsquery('simple'::regconfig,
                                             (select string_agg(quote_literal(w), ' | ') from unnest(q.words) w))
                         as query
                  from q where cardinality(q.words) > 0)
      select c.article_id, c.version, c.title, c.audience, c.store_id, c.text,
             (s.shared::float8 / cardinality(tq.words)) + ts_rank(c.tsv, tq.query) / 10 as score
      from tq
      join knowledge_chunks c on c.workspace_id = app_workspace_id() and c.tsv @@ tq.query
      join knowledge_articles a on a.id = c.article_id and a.archived_at is null and a.published_version = c.version
      cross join lateral (
        select count(*)::int as shared
        from (select unnest(tsvector_to_array(c.tsv)) intersect select unnest(tq.words)) both_words
      ) s
      where c.audience = any(${[...audiences]}::text[]) and ${scope}
        and (${!unembedded} or c.embedding is null)
        and s.shared >= least(2, cardinality(tq.words))
      order by score desc
      limit ${CANDIDATES}`
  })

/** Whether any published chapter is there to read, so a workspace with none asks the embedder nothing. */
const anyPublished = (sql: SqlClient.SqlClient, audiences: ReadonlyArray<string>) =>
  Effect.map(
    sql`select 1 from knowledge_chunks c
        join knowledge_articles a on a.id = c.article_id and a.archived_at is null and a.published_version = c.version
        where c.workspace_id = app_workspace_id() and c.audience = any(${[...audiences]}::text[])
        limit 1`,
    (rows) => rows.length > 0
  )

/** The best piece per chapter, best first, at most `limit`. */
const bestPerChapter = (rows: ReadonlyArray<HitRow>, limit: number): ReadonlyArray<Hit> => {
  const best = new Map<string, HitRow>()
  for (const r of rows) {
    const had = best.get(r.articleId)
    if (had === undefined || r.score > had.score) best.set(r.articleId, r)
  }
  // A fresh array (`toSorted` is past this package's `lib`).
  // oxlint-disable-next-line unicorn/no-array-sort
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit).map((r) => ({
    articleId: r.articleId,
    version: r.version,
    title: r.title,
    audience: r.audience,
    storeId: r.storeId,
    text: r.text,
    score: Math.round(r.score * 1000) / 1000
  }))
}

/** The published pieces that answer `query`, by meaning where the stage can, by words otherwise. */
export const search = Effect.fn("Knowledge.search")(function*(inTx: InTx<CurrentPrincipal>, input: SearchInput) {
  const query = input.query.trim()
  const limit = input.limit ?? DEFAULT_LIMIT
  const audiences = audienceIn(input.audience)
  const embedder = yield* Embedder
  if (query === "" || !(yield* inTx((sql) => anyPublished(sql, audiences)))) {
    return new SearchResult({ hits: [], mode: embedder === null ? "text" : "vector" })
  }
  const vector = embedder === null ? null : yield* queryVector(inTx, embedder, query)
  if (vector === null || embedder === null) {
    const rows = yield* inTx((sql) => byWords(sql, query, audiences, false))
    return new SearchResult({ hits: bestPerChapter(rows, limit), mode: "text" })
  }
  const rows = yield* inTx((sql) =>
    Effect.gen(function*() {
      const near = (yield* byMeaning(sql, vector, audiences)).filter((r) => r.score >= embedder.minScore)
      // Pieces published a moment ago and not embedded yet are found by their words meanwhile.
      const fresh = yield* byWords(sql, query, audiences, true)
      return [...near, ...fresh.map((r) => ({ ...r, score: Math.min(r.score, 1) * embedder.minScore * 2 }))]
    })
  )
  return new SearchResult({ hits: bestPerChapter(rows, limit), mode: "vector" })
})

/** An answer used these chapters: one citation each, for "{n}× gebruikt". */
export const cite = Effect.fn("Knowledge.cite")(function*(
  sql: SqlClient.SqlClient,
  hits: ReadonlyArray<Pick<Hit, "articleId" | "version">>,
  source: { readonly kind: "draft" | "agent_action" | "ask_turn" | "channel_message"; readonly id: string }
) {
  const seen = new Set<string>()
  for (const h of hits) {
    if (seen.has(h.articleId)) continue
    seen.add(h.articleId)
    yield* sql`insert into knowledge_citations (id, workspace_id, article_id, version, source_kind, source_id)
               values (${mintId("kct")}, app_workspace_id(), ${h.articleId}, ${h.version}, ${source.kind},
                       ${source.id})
               on conflict (source_kind, source_id, article_id) do nothing`
  }
})

/** The chapters an answer cited, by its source: what the draft card names. */
export const citedBy = Effect.fn("Knowledge.citedBy")(function*(
  sql: SqlClient.SqlClient,
  source: { readonly kind: "draft" | "agent_action" | "ask_turn" | "channel_message"; readonly id: string }
) {
  return yield* sql<{ articleId: string; version: number; title: string }>`
    select c.article_id, c.version, v.title
    from knowledge_citations c join knowledge_versions v on v.article_id = c.article_id and v.version = c.version
    where c.source_kind = ${source.kind} and c.source_id = ${source.id}
    order by v.title`
})

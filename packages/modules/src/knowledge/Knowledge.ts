import { Db } from "@insyte/database/Db"
import type { Conflict, Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import type { CurrentPrincipal, CurrentWorkspace } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { type SqlClient, SqlError } from "effect/sql"
import type {
  Article,
  ArticleArchived,
  ArticleList,
  ArticleSaved,
  CreateInput,
  EmbeddingFailed,
  Gap,
  GapChanged,
  GapList,
  GapNotOpen,
  GapsInput,
  KnowledgeStale,
  ListInput,
  SaveInput,
  SearchInput,
  SearchResult,
  Version
} from "./domain/Knowledge.ts"
import * as Articles from "./use-cases/articles.ts"
import * as Embed from "./use-cases/embed.ts"
import * as Gaps from "./use-cases/gaps.ts"
import * as Search from "./use-cases/search.ts"

/*
 * The knowledge base (M15 step 7; api.md §2.24): Kennisbank's chapters and versions, the gaps, and the search the
 * answers read it through. A database that does not answer is a defect, as everywhere.
 */

type R = Db | CurrentPrincipal
type Write = Forbidden | NotFound | Invalid | KnowledgeStale | ArticleArchived

/** @effect-expect-leaking Db CurrentPrincipal */
export class KnowledgeService extends Context.Service<KnowledgeService, {
  readonly list: (input: ListInput) => Effect.Effect<ArticleList, Forbidden, R>
  readonly get: (id: string) => Effect.Effect<Article, Forbidden | NotFound, R>
  readonly versions: (id: string) => Effect.Effect<ReadonlyArray<Version>, Forbidden | NotFound, R>
  readonly version: (id: string, n: number) => Effect.Effect<Version, Forbidden | NotFound, R>
  readonly create: (input: CreateInput) => Effect.Effect<ArticleSaved, Forbidden | Invalid | NotFound, R>
  readonly saveDraft: (input: SaveInput) => Effect.Effect<ArticleSaved, Write, R>
  readonly publish: (input: SaveInput) => Effect.Effect<ArticleSaved, Write, R>
  readonly restore: (id: string, version: number) => Effect.Effect<ArticleSaved, Write, R>
  readonly archive: (id: string) => Effect.Effect<ArticleSaved, Forbidden | NotFound, R>
  readonly gaps: (input: GapsInput) => Effect.Effect<GapList, Forbidden, R>
  readonly gap: (id: string) => Effect.Effect<Gap, Forbidden | NotFound, R>
  readonly dismissGap: (id: string) => Effect.Effect<GapChanged, Forbidden | NotFound | GapNotOpen, R>
  readonly restoreGap: (id: string) => Effect.Effect<GapChanged, Forbidden | NotFound | GapNotOpen | Conflict, R>
  readonly linkGap: (
    input: { readonly gapId: string; readonly articleId: string }
  ) => Effect.Effect<GapChanged, Forbidden | NotFound | GapNotOpen, R>
  readonly search: (input: SearchInput) => Effect.Effect<SearchResult, Forbidden, R>
  /** The published chapters as the public API reads them (`id`: one, or none). */
  readonly published: (id: string | null) => Effect.Effect<ReadonlyArray<Articles.Published>, Forbidden, R>
  /** The search as the public API reads it: published chapters, with `support.read`. */
  readonly searchPublished: (input: SearchInput) => Effect.Effect<SearchResult, Forbidden, R>
}>()("modules/KnowledgeService") {
  static readonly layer = Layer.succeed(KnowledgeService, {
    list: (input) => scoped((sql) => Articles.list(sql, input)),
    get: (id) => scoped((sql) => Articles.get(sql, id)),
    versions: (id) => scoped((sql) => Articles.versions(sql, id)),
    version: (id, n) => scoped((sql) => Articles.version(sql, id, n)),
    create: (input) => scoped((sql) => Articles.create(sql, input)),
    saveDraft: (input) => scoped((sql) => Articles.saveDraft(sql, input)),
    publish: (input) => scoped((sql) => Articles.publish(sql, input)),
    restore: (id, version) => scoped((sql) => Articles.restoreVersion(sql, { id, version })),
    archive: (id) => scoped((sql) => Articles.archive(sql, id)),
    gaps: (input) => scoped((sql) => Gaps.list(sql, input)),
    gap: (id) => scoped((sql) => Gaps.get(sql, id)),
    dismissGap: (id) => scoped((sql) => Gaps.dismiss(sql, id)),
    restoreGap: (id) => scoped((sql) => Gaps.restore(sql, id)),
    linkGap: (input) => scoped((sql) => Gaps.link(sql, input)),
    published: (id) => scoped((sql) => Articles.published(sql, id)),
    search: (input) =>
      Effect.gen(function*() {
        // Reading by search is reading the knowledge base.
        yield* Policy.require("settings", 1)
        const db = yield* Db
        return yield* Search.search(db.scoped, input)
      }).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)),
    searchPublished: (input) =>
      Effect.gen(function*() {
        // What the published chapters say is what support answers with; a key reaches no Instellingen.
        yield* Policy.require("support", 1)
        const db = yield* Db
        return yield* Search.search(db.scoped, input)
      }).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
  })
}

const scoped = <A, E>(
  f: (sql: SqlClient.SqlClient) => Effect.Effect<A, E | SqlError.SqlError, CurrentPrincipal>
) =>
  Effect.flatMap(Effect.service(Db), (db) => db.scoped(f)).pipe(
    Effect.catchIf(SqlError.isSqlError, Effect.die)
  ) as Effect.Effect<A, Exclude<E, SqlError.SqlError>, R>

/** A published chapter's pieces embedded, on the jobs Worker; the embedder's failure is retried by the queue. */
export const embedArticle = (
  articleId: string,
  version: number
): Effect.Effect<Embed.Embedded, EmbeddingFailed, Db | CurrentWorkspace> =>
  Embed.embedArticle(articleId, version).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))

/** The undo of a chapter's writes and of "negeren" (`UndoCompensations`). */
export const restore = Articles.restore
export const restoreGap = Gaps.undoDismiss

export { file as fileGap } from "./use-cases/gaps.ts"
export { cite, citedBy, search } from "./use-cases/search.ts"

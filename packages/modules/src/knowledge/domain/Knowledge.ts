import { Context, type Effect, Schema } from "effect"
import { UndoTicket } from "../../shared/domain/Undo.ts"

/*
 * The knowledge base (M15 step 7; domain.md §9.9, api.md §2.24, ai.md §11): Kennisbank's chapters, each with its
 * versions and the one published version the agents read, the questions Insyte could not answer (gaps), and the search
 * an answer reads them through. A draft is never read by an answer.
 *
 * Who may do what (M15's decision): reading needs Instellingen · Bekijken; writing a draft, "negeren" and "Toevoegen
 * aan…" need Instellingen · Bewerken; publishing (or putting back) a chapter the customer agent answers from also needs
 * `ai.autonomy`. A chapter only Vraag Insyte reads is published with Bewerken alone.
 */

/** The longest a chapter may be, counted as the browser counts it (UTF-16 code units). */
export const LIMIT = 40_000

export const AUDIENCES = ["customer_agent", "assistant", "both"] as const
export const Audience = Schema.Literals(AUDIENCES)
export type Audience = typeof Audience.Type

/** Whether a chapter with this audience is read by the customer agent: publishing it needs `ai.autonomy`. */
export const reachesCustomers = (audience: Audience) => audience !== "assistant"

export const Status = Schema.Literals(["published", "draft", "changed"])
export type Status = typeof Status.Type

/** A chapter's title: one to 120 characters (trimmed on the server; blank is `Invalid`). */
export const Title = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(120))

/** A chapter's Markdown, at most `LIMIT` characters. */
export const Body = Schema.String.check(Schema.isMaxLength(LIMIT))

/* ── reads ─────────────────────────────────────────────────────────────────────────────────────────────────────── */

/** One chapter as Kennisbank's list shows it. */
export class ArticleRow extends Schema.Class<ArticleRow>("knowledge/ArticleRow")({
  id: Schema.String,
  title: Schema.String,
  audience: Audience,
  /** `null` for every store. */
  storeId: Schema.NullOr(Schema.String),
  status: Status,
  /** The working text's length in characters. */
  length: Schema.Int,
  publishedVersion: Schema.NullOr(Schema.Int),
  editedBy: Schema.String,
  editedAt: Schema.Finite,
  /** Answers that used it in the last seven days. */
  uses7d: Schema.Int
}) {}

/** One version, without its text (the editor's drawer lists them; `version` reads one's text). */
export const VersionSummary = Schema.Struct({
  version: Schema.Int,
  title: Schema.String,
  published: Schema.Boolean,
  by: Schema.String,
  at: Schema.Finite
})
export type VersionSummary = typeof VersionSummary.Type

/** One version with its text. */
export class Version extends Schema.Class<Version>("knowledge/Version")({
  version: Schema.Int,
  title: Schema.String,
  audience: Audience,
  body: Schema.String,
  published: Schema.Boolean,
  by: Schema.String,
  at: Schema.Finite
}) {}

/** One chapter as the editor shows it: the working text, the published one beside it, and its versions. */
export class Article extends Schema.Class<Article>("knowledge/Article")({
  id: Schema.String,
  title: Schema.String,
  audience: Audience,
  storeId: Schema.NullOr(Schema.String),
  body: Schema.String,
  status: Status,
  /** Raised by every save; a save names the one it was made on. */
  revision: Schema.Int,
  /** The version the agents read, with its title and text, or `null` for a draft never published. */
  published: Schema.NullOr(Schema.Struct({ version: Schema.Int, title: Schema.String, body: Schema.String })),
  versions: Schema.Array(VersionSummary),
  editedBy: Schema.String,
  editedAt: Schema.Finite,
  uses7d: Schema.Int,
  archived: Schema.Boolean
}) {}

export class ArticleList extends Schema.Class<ArticleList>("knowledge/ArticleList")({
  rows: Schema.Array(ArticleRow)
}) {}

export const Channel = Schema.Literals(["email", "webchat", "whatsapp", "instagram", "ask"])
export type Channel = typeof Channel.Type

export const GapState = Schema.Literals(["open", "answered", "dismissed"])

/** A question Insyte could not answer from the knowledge base. */
export class Gap extends Schema.Class<Gap>("knowledge/Gap")({
  id: Schema.String,
  question: Schema.String,
  /** A first name, for display; empty when none is known. */
  customer: Schema.String,
  channel: Channel,
  threadId: Schema.NullOr(Schema.String),
  ticketId: Schema.NullOr(Schema.String),
  state: GapState,
  /** "Toevoegen aan…": the chapter whose next publication answers it. */
  articleId: Schema.NullOr(Schema.String),
  count: Schema.Int,
  at: Schema.Finite,
  firstSeenAt: Schema.Finite
}) {}

export class GapList extends Schema.Class<GapList>("knowledge/GapList")({
  rows: Schema.Array(Gap),
  /** Every open gap, however many the list shows. */
  open: Schema.Int
}) {}

/** One piece of a published chapter that answers a question, with how well (higher is better, by the search). */
export const Hit = Schema.Struct({
  articleId: Schema.String,
  version: Schema.Int,
  title: Schema.String,
  audience: Audience,
  text: Schema.String,
  score: Schema.Finite
})
export type Hit = typeof Hit.Type

/** How the search went: by meaning (embeddings) or by words (Postgres' full-text search). */
export const SearchMode = Schema.Literals(["vector", "text"])
export type SearchMode = typeof SearchMode.Type

export class SearchResult extends Schema.Class<SearchResult>("knowledge/SearchResult")({
  hits: Schema.Array(Hit),
  mode: SearchMode
}) {}

/* ── inputs ────────────────────────────────────────────────────────────────────────────────────────────────────── */

export const IdInput = Schema.Struct({ id: Schema.String })
export const GapIdInput = Schema.Struct({ gapId: Schema.String })
export const VersionInput = Schema.Struct({ id: Schema.String, version: Schema.Int })

export const ListInput = Schema.Struct({
  /** Archived chapters too (Prullenbak-like views); left out, only the live ones. */
  archived: Schema.optional(Schema.Boolean),
  /** Only chapters with a published version (the customer agent's test, the public API). */
  published: Schema.optional(Schema.Boolean)
})
export type ListInput = typeof ListInput.Type

export const GapsInput = Schema.Struct({
  state: Schema.optional(GapState),
  limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })))
})
export type GapsInput = typeof GapsInput.Type

export const CreateInput = Schema.Struct({
  title: Title,
  audience: Audience,
  body: Body,
  storeId: Schema.optional(Schema.NullOr(Schema.String))
})
export type CreateInput = typeof CreateInput.Type

export const SaveInput = Schema.Struct({
  id: Schema.String,
  title: Title,
  audience: Audience,
  body: Body,
  /** The revision the editor read; a save made on an older one is refused (`KnowledgeStale`). */
  baseRevision: Schema.optional(Schema.Int)
})
export type SaveInput = typeof SaveInput.Type

export const LinkGapInput = Schema.Struct({ gapId: Schema.String, articleId: Schema.String })

export const SearchInput = Schema.Struct({
  query: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2000)),
  /** Who is asking: the customer agent reads `customer_agent` and `both`, Vraag Insyte `assistant` and `both`. */
  audience: Schema.optional(Schema.Literals(["customer_agent", "assistant", "any"])),
  limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 10 })))
})
export type SearchInput = typeof SearchInput.Type

/* ── answers of writes ─────────────────────────────────────────────────────────────────────────────────────────── */

export class ArticleSaved extends Schema.Class<ArticleSaved>("knowledge/ArticleSaved")({
  article: Article,
  undo: Schema.NullOr(UndoTicket)
}) {}

export class GapChanged extends Schema.Class<GapChanged>("knowledge/GapChanged")({
  gap: Gap,
  undo: Schema.NullOr(UndoTicket)
}) {}

/* ── errors ────────────────────────────────────────────────────────────────────────────────────────────────────── */

/** Someone saved the chapter since this editor read it: `revision` is the one it is at now. */
export class KnowledgeStale extends Schema.TaggedError<KnowledgeStale>()("KnowledgeStale", {
  revision: Schema.Int
}) {}

/** The gap is no longer open (answered or ignored by someone else). */
export class GapNotOpen extends Schema.TaggedError<GapNotOpen>()("GapNotOpen", { state: GapState }) {}

/** The chapter is archived: it is put back before it is changed. */
export class ArticleArchived extends Schema.TaggedError<ArticleArchived>()("ArticleArchived", {}) {}

/* ── the undo commands' snapshots ──────────────────────────────────────────────────────────────────────────────── */

/** What an article's undo puts back. */
export const ArticleRestore = Schema.Union([
  /** A create: the chapter archived again. */
  Schema.TaggedStruct("Created", { id: Schema.String }),
  /** A draft save: the working text as it was (a new draft version of it). */
  Schema.TaggedStruct("Draft", {
    id: Schema.String,
    title: Schema.String,
    audience: Audience,
    body: Schema.String
  }),
  /**
   * A publication or a put-back: the version published before it published again (a new version), or, where there was
   * none, the chapter a draft again; and the gaps it answered open again.
   */
  Schema.TaggedStruct("Published", {
    id: Schema.String,
    previous: Schema.NullOr(Schema.Int),
    title: Schema.String,
    audience: Audience,
    body: Schema.String,
    gapIds: Schema.Array(Schema.String)
  }),
  /** An archive: the chapter back, and its published version searchable again. */
  Schema.TaggedStruct("Archived", { id: Schema.String })
])
export type ArticleRestore = typeof ArticleRestore.Type

export const GapRestore = Schema.Struct({
  gapId: Schema.String,
  state: GapState,
  articleId: Schema.NullOr(Schema.String)
})
export type GapRestore = typeof GapRestore.Type

/* ── embeddings ────────────────────────────────────────────────────────────────────────────────────────────────── */

/** `bge-m3`'s width. */
export const DIMENSIONS = 1024

/** The embedder did not answer; the search reads by words instead, and the job tries again. */
export class EmbeddingFailed extends Schema.TaggedError<EmbeddingFailed>()("EmbeddingFailed", {
  reason: Schema.String
}) {}

export interface EmbedderApi {
  readonly provider: "workers_ai" | "fake"
  readonly model: string
  /** Below this cosine similarity a piece does not answer the question; each model's own scale. */
  readonly minScore: number
  /** US dollars per million input tokens. */
  readonly pricePerMillion: number
  /** One vector of `DIMENSIONS` per text, in order. */
  readonly embed: (texts: ReadonlyArray<string>) => Effect.Effect<ReadonlyArray<ReadonlyArray<number>>, EmbeddingFailed>
}

/**
 * The stage's embedder (`EMBEDDINGS_ADAPTER`): Workers AI's `bge-m3`, the deterministic fake (tests, local runs,
 * previews), or none, where the knowledge base is searched by its words only. Chosen where the app is composed.
 */
export const Embedder = Context.Reference<EmbedderApi | null>("knowledge/Embedder", { defaultValue: () => null })

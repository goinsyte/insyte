import { Conflict, Invalid, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { PendingEvents } from "../../shared/domain/Outbox.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { inScopeOrNone } from "../../shared/use-cases/StoreScope.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import { chunk } from "../domain/Chunks.ts"
import {
  Article,
  ArticleArchived,
  ArticleList,
  ArticleRestore,
  ArticleRow,
  ArticleSaved,
  type Audience,
  type CreateInput,
  KnowledgeStale,
  type ListInput,
  reachesCustomers,
  type SaveInput,
  type Status,
  Version
} from "../domain/Knowledge.ts"

/*
 * Kennisbank's chapters (M15 step 7; widgets/04 §F "Kennisbank" and "Hoofdstuk"): the list, one chapter with its
 * versions, and every write with its undo (ADR-0023).
 *
 * - Every save is a version: "Opslaan als concept" one the agents do not read, "Publiceren" the one they do. A save
 *   names the revision the editor read and is refused when someone saved since (`KnowledgeStale`).
 * - Publishing rebuilds the chapter's pieces for search from the published text and answers the gaps "Toevoegen aan…"
 *   pointed at it; the pieces' embeddings follow on the jobs Worker (`knowledge.published`). Its undo publishes the
 *   version before it again as a new version (or makes the chapter a draft again when there was none), and opens the
 *   gaps it answered.
 * - "Terugzetten" publishes an earlier version again, as a new version, so the old ones stay.
 * - Archiving takes the chapter out of every answer; its undo puts it back.
 *
 * Reading needs Instellingen · Bekijken, a draft Beheren; publishing or putting back a chapter the customer agent
 * reads (before or after) also needs `ai.autonomy`. A chapter for one store is read only by who reaches that store.
 */

export const RESTORE = "knowledge.restore"

interface Row {
  readonly id: string
  readonly title: string
  readonly audience: Audience
  readonly storeId: string | null
  readonly body: string
  readonly publishedVersion: number | null
  readonly revision: number
  readonly updatedAt: Date
  readonly archivedAt: Date | null
  readonly editedBy: string
  readonly publishedTitle: string | null
  readonly publishedBody: string | null
  readonly uses7d: number
}

/** Whose name an edit carries: the member's, or Insyte's for what no member did. */
const NAME = `coalesce(nullif(u.name, ''), case when m.id is null then 'Insyte' else 'Iemand' end)`

const select = (sql: SqlClient.SqlClient) =>
  sql`select a.id, a.title, a.audience, a.store_id, a.body, a.published_version, a.revision, a.updated_at,
             a.archived_at, ${sql.literal(NAME)} as edited_by, v.title as published_title, v.body as published_body,
             (select count(*)::int from knowledge_citations c
               where c.article_id = a.id and c.at > now() - interval '7 days') as uses7d
      from knowledge_articles a
      left join members m on m.id = a.updated_by
      left join auth."user" u on u.id = m.user_id
      left join knowledge_versions v on v.article_id = a.id and v.version = a.published_version`

const statusOf = (r: Row): Status =>
  r.publishedVersion === null
    ? "draft"
    : r.publishedBody === r.body && r.publishedTitle === r.title
    ? "published"
    : "changed"

const rowOf = (r: Row) =>
  new ArticleRow({
    id: r.id,
    title: r.title,
    audience: r.audience,
    storeId: r.storeId,
    status: statusOf(r),
    length: r.body.length,
    publishedVersion: r.publishedVersion,
    editedBy: r.editedBy,
    editedAt: r.updatedAt.getTime(),
    uses7d: r.uses7d
  })

const versionsOf = (sql: SqlClient.SqlClient, id: string) =>
  sql<{ version: number; title: string; published: boolean; by: string; at: Date }>`
    select v.version, v.title, v.published, ${sql.literal(NAME)} as by, v.saved_at as at
    from knowledge_versions v
    left join members m on m.id = v.saved_by
    left join auth."user" u on u.id = m.user_id
    where v.article_id = ${id}
    order by v.version`

const articleOf = (sql: SqlClient.SqlClient, r: Row) =>
  Effect.map(versionsOf(sql, r.id), (versions) =>
    new Article({
      id: r.id,
      title: r.title,
      audience: r.audience,
      storeId: r.storeId,
      body: r.body,
      status: statusOf(r),
      revision: r.revision,
      published: r.publishedVersion === null
        ? null
        : { version: r.publishedVersion, title: r.publishedTitle ?? r.title, body: r.publishedBody ?? "" },
      versions: versions.map((v) => ({
        version: v.version,
        title: v.title,
        published: v.published,
        by: v.by,
        at: v.at.getTime()
      })),
      editedBy: r.editedBy,
      editedAt: r.updatedAt.getTime(),
      uses7d: r.uses7d,
      archived: r.archivedAt !== null
    }))

/** The chapter, if the principal's stores reach it (one of no store is everyone's). */
const find = Effect.fn("Knowledge.find")(function*(sql: SqlClient.SqlClient, id: string, lock = false) {
  const scope = yield* inScopeOrNone(sql, "a.store_id")
  if (lock) {
    const [locked] = yield* sql`select 1 from knowledge_articles a where a.id = ${id} and ${scope} for update`
    if (locked === undefined) return yield* new NotFound({ entity: "knowledge_article", id })
  }
  const [row] = yield* sql<Row>`${select(sql)} where a.id = ${id} and ${scope}`
  if (row === undefined) return yield* new NotFound({ entity: "knowledge_article", id })
  return row
})

/** Kennisbank's chapters, the last edited first. */
export const list = Effect.fn("Knowledge.list")(function*(sql: SqlClient.SqlClient, input: ListInput) {
  yield* Policy.require("settings", 1)
  const scope = yield* inScopeOrNone(sql, "a.store_id")
  const rows = yield* sql<Row>`
    ${select(sql)}
    where ${scope}
      and (${input.archived === true} or a.archived_at is null)
      and (${input.published !== true} or a.published_version is not null)
    order by a.updated_at desc, a.id
    limit 500`
  return new ArticleList({ rows: rows.map(rowOf) })
})

/** One chapter with its versions; an archived one too (its undo, the Prullenbak). */
export const get = Effect.fn("Knowledge.get")(function*(sql: SqlClient.SqlClient, id: string) {
  yield* Policy.require("settings", 1)
  return yield* articleOf(sql, yield* find(sql, id))
})

/** Every version's text, newest last, for the drawer's diff. */
export const versions = Effect.fn("Knowledge.versions")(function*(sql: SqlClient.SqlClient, id: string) {
  yield* Policy.require("settings", 1)
  yield* find(sql, id)
  const rows = yield* sql<
    { version: number; title: string; audience: Audience; body: string; published: boolean; by: string; at: Date }
  >`
    select v.version, v.title, v.audience, v.body, v.published, ${sql.literal(NAME)} as by, v.saved_at as at
    from knowledge_versions v
    left join members m on m.id = v.saved_by
    left join auth."user" u on u.id = m.user_id
    where v.article_id = ${id}
    order by v.version desc
    limit 100`
  // A fresh array (`toReversed` is past this package's `lib`).
  // oxlint-disable-next-line unicorn/no-array-reverse
  return [...rows].reverse().map((v) => new Version({ ...v, at: v.at.getTime() }))
})

/** A chapter as the public API and the agents read it: its published version, never a draft. */
export interface Published {
  readonly id: string
  readonly title: string
  readonly audience: Audience
  readonly storeId: string | null
  readonly version: number
  /** The published text; the list leaves it out (`null`) and names its length. */
  readonly body: string | null
  readonly length: number
  readonly publishedAt: Date
}

/**
 * The published chapters (`GET /v1/knowledge_articles`, `list_knowledge`), or one (`/{id}`): each one's published
 * version, none archived, within the principal's stores. A chapter never published is not there.
 */
export const published = Effect.fn("Knowledge.published")(function*(sql: SqlClient.SqlClient, id: string | null) {
  // What the published chapters say is what support answers with: `support.read`, so a key reaches no Instellingen.
  yield* Policy.require("support", 1)
  const scope = yield* inScopeOrNone(sql, "a.store_id")
  return yield* sql<Published>`
    select a.id, v.title, v.audience, a.store_id, v.version,
           case when ${id}::text is null then null else v.body end as body, length(v.body)::int as length,
           v.saved_at as published_at
    from knowledge_articles a
    join knowledge_versions v on v.article_id = a.id and v.version = a.published_version
    where a.archived_at is null and ${scope} and (${id}::text is null or a.id = ${id})
    order by lower(v.title), a.id
    limit 500`
})

/** One version's text. */
export const version = Effect.fn("Knowledge.version")(function*(sql: SqlClient.SqlClient, id: string, n: number) {
  const all = yield* versions(sql, id)
  const v = all.find((x) => x.version === n)
  if (v === undefined) return yield* new NotFound({ entity: "knowledge_version", id: `${id}@${n}` })
  return v
})

/* ── writes ────────────────────────────────────────────────────────────────────────────────────────────────────── */

const trimmedTitle = (title: string) => {
  const t = title.trim()
  return t === "" ? Effect.fail(new Invalid({ fields: { title: "required" } })) : Effect.succeed(t)
}

const nextVersion = (sql: SqlClient.SqlClient, id: string) =>
  Effect.map(
    sql<{ n: number }>`select coalesce(max(version), 0)::int + 1 as n from knowledge_versions where article_id = ${id}`,
    ([r]) => r!.n
  )

const writeVersion = Effect.fn("Knowledge.writeVersion")(function*(
  sql: SqlClient.SqlClient,
  id: string,
  content: { readonly title: string; readonly audience: Audience; readonly body: string },
  published: boolean
) {
  const p = yield* CurrentPrincipal
  const n = yield* nextVersion(sql, id)
  yield* sql`insert into knowledge_versions (workspace_id, article_id, version, title, audience, body, published,
                                             saved_by)
             values (app_workspace_id(), ${id}, ${n}, ${content.title}, ${content.audience}, ${content.body},
                     ${published}, ${p.kind === "member" ? p.id : null})`
  return n
})

/** The working text, and with `published` the version the agents read. */
const writeArticle = Effect.fn("Knowledge.writeArticle")(function*(
  sql: SqlClient.SqlClient,
  id: string,
  content: { readonly title: string; readonly audience: Audience; readonly body: string },
  published?: number | null
) {
  const p = yield* CurrentPrincipal
  yield* sql`update knowledge_articles
             set title = ${content.title}, audience = ${content.audience}, body = ${content.body},
                 published_version = case when ${published === undefined} then published_version
                                          else ${published ?? null}::int end,
                 revision = revision + 1, updated_by = ${p.kind === "member" ? p.id : null}, updated_at = now()
             where id = ${id}`
})

/**
 * The chapter's pieces for search, from the version the agents read: replaced, without embeddings (the jobs Worker
 * adds them, `knowledge.published`); none for a draft or an archived chapter.
 */
export const rebuildChunks = Effect.fn("Knowledge.rebuildChunks")(function*(sql: SqlClient.SqlClient, id: string) {
  yield* sql`delete from knowledge_chunks where article_id = ${id}`
  const [a] = yield* sql<
    { version: number | null; title: string; audience: Audience; body: string; storeId: string | null }
  >`
    select a.published_version as version, v.title, v.audience, v.body, a.store_id
    from knowledge_articles a join knowledge_versions v on v.article_id = a.id and v.version = a.published_version
    where a.id = ${id} and a.archived_at is null`
  if (a === undefined || a.version === null) return null
  const pieces = chunk(a.title, a.body)
  for (const piece of pieces) {
    yield* sql`insert into knowledge_chunks (id, workspace_id, article_id, version, ordinal, store_id, audience, title,
                                             text)
               values (${mintId("kch")}, app_workspace_id(), ${id}, ${a.version}, ${piece.ordinal}, ${a.storeId},
                       ${a.audience}, ${a.title}, ${piece.text.slice(0, 8000)})`
  }
  const p = yield* CurrentPrincipal
  const outboxId = yield* Outbox.write(sql, p.workspaceId, {
    type: "knowledge.published",
    workspaceId: p.workspaceId,
    userId: p.userId ?? p.id,
    articleId: id,
    version: a.version
  })
  ;(yield* PendingEvents)?.add(outboxId)
  return a.version
})

const audit = (
  sql: SqlClient.SqlClient,
  action: string,
  subjectId: string,
  diff?: Record<string, unknown>
) =>
  Effect.gen(function*() {
    const p = yield* CurrentPrincipal
    // In the Logboek on Kennisbank, by the chapter's title as it is now.
    const [article] = yield* sql<{ title: string }>`select title from knowledge_articles where id = ${subjectId}`
    yield* Audit.write(sql, p.workspaceId, { kind: p.kind, id: p.id }, {
      action,
      subjectType: "knowledge_article",
      subjectId,
      section: "knowledge",
      ...(diff === undefined ? {} : { diff }),
      log: { name: article?.title }
    })
  })

/**
 * Publishing needs Beheren, and `ai.autonomy` where the customer agent reads the chapter before or after: the version
 * published now, and the one it replaces. A draft's own audience is read by no agent.
 */
const requirePublish = (...audiences: ReadonlyArray<Audience | null>) =>
  Effect.gen(function*() {
    yield* Policy.require("settings", 3)
    if (audiences.some((a) => a !== null && reachesCustomers(a))) yield* Policy.requireAction("ai.autonomy")
  })

const checkRevision = (row: Row, base: number | undefined) =>
  base !== undefined && base !== row.revision
    ? Effect.fail(new KnowledgeStale({ revision: row.revision }))
    : Effect.void

const checkLive = (row: Row) => (row.archivedAt === null ? Effect.void : Effect.fail(new ArticleArchived()))

const savedOf = (sql: SqlClient.SqlClient, id: string, restore: ArticleRestore | null) =>
  Effect.gen(function*() {
    const article = yield* articleOf(sql, yield* find(sql, id))
    const undo = restore === null ? null : yield* Undo.issue(sql, { command: RESTORE, compensation: restore })
    return new ArticleSaved({ article, undo })
  })

/** "Hoofdstuk schrijven", or one of the suggested starts: a new chapter, as a draft. */
export const create = Effect.fn("Knowledge.create")(function*(sql: SqlClient.SqlClient, input: CreateInput) {
  yield* Policy.require("settings", 3)
  const p = yield* CurrentPrincipal
  const title = yield* trimmedTitle(input.title)
  const storeId = input.storeId ?? null
  if (storeId !== null) {
    // Only a store the principal reaches.
    const scope = yield* inScopeOrNone(sql, "s.id")
    const [s] = yield* sql`select 1 from stores s where s.id = ${storeId} and ${scope}`
    if (s === undefined) return yield* new Invalid({ fields: { storeId: "unknown" } })
  }
  const id = mintId("kb")
  const by = p.kind === "member" ? p.id : null
  yield* sql`insert into knowledge_articles (id, workspace_id, store_id, title, audience, body, created_by, updated_by)
             values (${id}, app_workspace_id(), ${storeId}, ${title}, ${input.audience}, ${input.body}, ${by}, ${by})`
  yield* writeVersion(sql, id, { title, audience: input.audience, body: input.body }, false)
  yield* audit(sql, "knowledge_article.created", id, { title, audience: input.audience })
  return yield* savedOf(sql, id, { kind: "created", id })
})

/** "Opslaan als concept": a version the agents do not read. */
export const saveDraft = Effect.fn("Knowledge.saveDraft")(function*(sql: SqlClient.SqlClient, input: SaveInput) {
  yield* Policy.require("settings", 3)
  const row = yield* find(sql, input.id, true)
  yield* checkLive(row)
  yield* checkRevision(row, input.baseRevision)
  const content = { title: yield* trimmedTitle(input.title), audience: input.audience, body: input.body }
  yield* writeVersion(sql, row.id, content, false)
  yield* writeArticle(sql, row.id, content)
  yield* audit(sql, "knowledge_article.draft_saved", row.id, { length: content.body.length })
  return yield* savedOf(sql, row.id, {
    kind: "draft",
    id: row.id,
    title: row.title,
    audience: row.audience,
    body: row.body
  })
})

const publishedAudience = (sql: SqlClient.SqlClient, row: Row) =>
  row.publishedVersion === null
    ? Effect.succeed(null)
    : Effect.map(
      sql<{ audience: Audience }>`
        select audience from knowledge_versions where article_id = ${row.id} and version = ${row.publishedVersion}`,
      ([v]) => v?.audience ?? null
    )

/** "Publiceren": the text as a new version the agents read; the gaps pointed at this chapter answered. */
export const publish = Effect.fn("Knowledge.publish")(function*(sql: SqlClient.SqlClient, input: SaveInput) {
  // Beheren before the chapter is looked for: who may not publish learns nothing of what is there.
  yield* Policy.require("settings", 3)
  const row = yield* find(sql, input.id, true)
  yield* requirePublish(input.audience, yield* publishedAudience(sql, row))
  yield* checkLive(row)
  yield* checkRevision(row, input.baseRevision)
  const content = { title: yield* trimmedTitle(input.title), audience: input.audience, body: input.body }
  const n = yield* writeVersion(sql, row.id, content, true)
  yield* writeArticle(sql, row.id, content, n)
  yield* rebuildChunks(sql, row.id)
  const answered = yield* sql<{ id: string }>`
    update knowledge_gaps set state = 'answered', resolved_article_id = ${row.id}, resolved_version = ${n},
                              resolved_at = now()
    where target_article_id = ${row.id} and state = 'open'
    returning id`
  const p = yield* CurrentPrincipal
  for (const g of answered) {
    yield* Audit.write(sql, p.workspaceId, { kind: p.kind, id: p.id }, {
      action: "knowledge_gap.answered",
      subjectType: "knowledge_gap",
      subjectId: g.id,
      diff: { articleId: row.id, version: n }
    })
  }
  yield* audit(sql, "knowledge_article.published", row.id, { version: n, audience: content.audience })
  return yield* savedOf(sql, row.id, {
    kind: "published",
    id: row.id,
    previous: row.publishedVersion,
    title: row.title,
    audience: row.audience,
    body: row.body,
    gapIds: answered.map((g) => g.id)
  })
})

/** "Terugzetten": an earlier version published again, as a new one. */
export const restoreVersion = Effect.fn("Knowledge.restoreVersion")(function*(
  sql: SqlClient.SqlClient,
  input: { readonly id: string; readonly version: number }
) {
  yield* Policy.require("settings", 3)
  const row = yield* find(sql, input.id, true)
  const [v] = yield* sql<{ title: string; audience: Audience; body: string }>`
    select title, audience, body from knowledge_versions where article_id = ${row.id} and version = ${input.version}`
  if (v === undefined) return yield* new NotFound({ entity: "knowledge_version", id: `${row.id}@${input.version}` })
  yield* requirePublish(v.audience, yield* publishedAudience(sql, row))
  yield* checkLive(row)
  const n = yield* writeVersion(sql, row.id, v, true)
  yield* writeArticle(sql, row.id, v, n)
  yield* rebuildChunks(sql, row.id)
  yield* audit(sql, "knowledge_article.restored", row.id, { from: input.version, version: n })
  return yield* savedOf(sql, row.id, {
    kind: "published",
    id: row.id,
    previous: row.publishedVersion,
    title: row.title,
    audience: row.audience,
    body: row.body,
    gapIds: []
  })
})

/** "Archiveren": out of every answer and the list; its undo puts it back. */
export const archive = Effect.fn("Knowledge.archive")(function*(sql: SqlClient.SqlClient, id: string) {
  yield* Policy.require("settings", 3)
  const row = yield* find(sql, id, true)
  if (row.archivedAt !== null) return yield* savedOf(sql, row.id, null)
  const p = yield* CurrentPrincipal
  yield* sql`update knowledge_articles set archived_at = now(), archived_by = ${p.id} where id = ${row.id}`
  yield* sql`delete from knowledge_chunks where article_id = ${row.id}`
  yield* sql`update knowledge_gaps set target_article_id = null where target_article_id = ${row.id} and state = 'open'`
  yield* audit(sql, "knowledge_article.archived", row.id)
  return yield* savedOf(sql, row.id, { kind: "archived", id: row.id })
})

/* ── undo ──────────────────────────────────────────────────────────────────────────────────────────────────────── */

const decodeRestore = Schema.decodeUnknownEffect(ArticleRestore)

/** Undo of any of the writes above, from the snapshot its token holds. */
export const restore = Effect.fn("Knowledge.restore")(function*(sql: SqlClient.SqlClient, compensation: unknown) {
  const c = yield* decodeRestore(compensation).pipe(Effect.orDie)
  const row = yield* find(sql, c.id, true)
  const p = yield* CurrentPrincipal
  switch (c.kind) {
    case "created": {
      yield* Policy.require("settings", 3)
      yield* sql`update knowledge_articles set archived_at = now(), archived_by = ${p.id} where id = ${row.id}`
      yield* sql`delete from knowledge_chunks where article_id = ${row.id}`
      yield* audit(sql, "knowledge_article.archived", row.id, { undo: true })
      return
    }
    case "archived": {
      yield* Policy.require("settings", 3)
      yield* sql`update knowledge_articles set archived_at = null, archived_by = null where id = ${row.id}`
      yield* rebuildChunks(sql, row.id)
      yield* audit(sql, "knowledge_article.unarchived", row.id, { undo: true })
      return
    }
    case "draft": {
      yield* Policy.require("settings", 3)
      if (row.archivedAt !== null) return yield* new Conflict({ entity: "knowledge_article", reason: "archived" })
      const content = { title: c.title, audience: c.audience, body: c.body }
      yield* writeVersion(sql, row.id, content, false)
      yield* writeArticle(sql, row.id, content)
      yield* audit(sql, "knowledge_article.draft_saved", row.id, { undo: true })
      return
    }
    case "published": {
      const before = c.previous === null
        ? null
        : (yield* sql<{ title: string; audience: Audience; body: string }>`
            select title, audience, body from knowledge_versions where article_id = ${row.id} and version = ${c.previous}`)[
          0
        ]
      yield* requirePublish(before?.audience ?? null, yield* publishedAudience(sql, row))
      if (row.archivedAt !== null) return yield* new Conflict({ entity: "knowledge_article", reason: "archived" })
      const working = { title: c.title, audience: c.audience, body: c.body }
      if (before === undefined || before === null) {
        // There was no version before: the chapter is a draft again, out of every answer.
        yield* writeArticle(sql, row.id, working, null)
        yield* sql`delete from knowledge_chunks where article_id = ${row.id}`
      } else {
        const n = yield* writeVersion(sql, row.id, before, true)
        yield* writeArticle(sql, row.id, working, n)
        yield* rebuildChunks(sql, row.id)
      }
      if (c.gapIds.length > 0) {
        yield* sql`update knowledge_gaps set state = 'open', resolved_article_id = null, resolved_version = null,
                                         resolved_at = null
                   where id = any(${[...c.gapIds]}::text[]) and state = 'answered'`
        for (const gapId of c.gapIds) {
          yield* Audit.write(sql, p.workspaceId, { kind: p.kind, id: p.id }, {
            action: "knowledge_gap.reopened",
            subjectType: "knowledge_gap",
            subjectId: gapId
          })
        }
      }
      yield* audit(sql, "knowledge_article.unpublished", row.id, { undo: true, version: c.previous })
      return
    }
  }
})

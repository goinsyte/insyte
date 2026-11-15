import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * The knowledge base (M15 step 7; domain.md §9.9, §12.20, §12.31; ai.md §11): Kennisbank's chapters, the versions of
 * each, the published text in pieces for search, the questions Insyte could not answer, and every answer that used a
 * chapter. Additive only.
 *
 * - `vector` (pgvector 0.8.6): not a trusted extension, so the database's owner creates it once per database
 *   (`infra/db/roles.sql`; on Neon as `neondb_owner`), and here it is only asked for, which is a no-op once it is there.
 * - `knowledge_articles`: one chapter, its working title, audience and Markdown (≤ 40,000 characters, the same count as
 *   the browser's), the version the agents read (`published_version`, null for a draft never published), whether it is
 *   archived, and `revision`, raised on every save so a save made on an older one is refused (`KnowledgeStale`).
 *   `store_id` null is every store's (the default); a chapter for one store is read only by who reaches it.
 * - `knowledge_versions`: every save, a draft (`published = false`) or a publication, with who and when. Only a
 *   published one is ever read by an answer.
 * - `knowledge_chunks`: the published version in pieces (on headings, about 800 tokens with overlap), with its words
 *   for Postgres' own full-text search (`tsv`, Dutch) and its `bge-m3` embedding (1024 dimensions) once the embedding job
 *   has run (`embedded_at`). Publishing replaces the chapter's pieces; archiving removes them. The HNSW index is cosine;
 *   every search is filtered by the workspace (row level security and the query's own predicate).
 * - `knowledge_gaps`: a question Insyte could not answer from the knowledge base (a reply draft now, the customer agent
 *   later), once per question while it is open (`count` and `last_seen_at` rise on a repeat). `customer_label` is a
 *   first name for display; the question is the shopper's own words, so the shopper's GDPR export and erasure reach it
 *   through its thread or ticket. `target_article_id` is "Toevoegen aan…": the gap is answered when that chapter is
 *   next published. A gap from a ticket carries the ticket's store.
 * - `knowledge_citations`: one row each time an answer used a chapter (a draft now; Vraag Insyte's turns and the
 *   customer agent later), which backs "{n}× gebruikt" over seven days.
 *
 * Every table is members-only and refuses the newcomer (0096), as every table with row level security does.
 */

const NO_NEWCOMER = `app_principal_kind() is distinct from 'newcomer'`

const noNewcomer = (table: string) =>
  `create policy ${table}_no_newcomer on ${table} as restrictive for all
     using (${NO_NEWCOMER}) with check (${NO_NEWCOMER})`

export default statements(
  "create extension if not exists vector",
  //
  `create table knowledge_articles (
     id                text primary key,
     workspace_id      text not null references workspaces(id) on delete cascade,
     store_id          text references stores(id) on delete cascade,
     title             text not null check (char_length(title) between 1 and 120),
     audience          text not null check (audience in ('customer_agent', 'assistant', 'both')),
     body              text not null default '' check (char_length(body) <= 40000),
     published_version integer,
     revision          integer not null default 1,
     created_by        text,
     created_at        timestamptz not null default now(),
     updated_by        text,
     updated_at        timestamptz not null default now(),
     archived_at       timestamptz,
     archived_by       text
   )`,
  "create index knowledge_articles_list on knowledge_articles (workspace_id, updated_at desc) where archived_at is null",
  tenantTable("knowledge_articles", { membersOnly: true }),
  noNewcomer("knowledge_articles"),
  "revoke delete on knowledge_articles from insyte_app",
  //
  `create table knowledge_versions (
     workspace_id text not null references workspaces(id) on delete cascade,
     article_id   text not null references knowledge_articles(id) on delete cascade,
     version      integer not null check (version >= 1),
     title        text not null,
     audience     text not null check (audience in ('customer_agent', 'assistant', 'both')),
     body         text not null check (char_length(body) <= 40000),
     published    boolean not null,
     saved_by     text,
     saved_at     timestamptz not null default now(),
     primary key (article_id, version)
   )`,
  "create index knowledge_versions_workspace on knowledge_versions (workspace_id, article_id, version desc)",
  tenantTable("knowledge_versions", { membersOnly: true }),
  noNewcomer("knowledge_versions"),
  "revoke update, delete on knowledge_versions from insyte_app",
  //
  `create table knowledge_chunks (
     id           text primary key,
     workspace_id text not null references workspaces(id) on delete cascade,
     article_id   text not null references knowledge_articles(id) on delete cascade,
     version      integer not null,
     ordinal      integer not null,
     store_id     text references stores(id) on delete cascade,
     audience     text not null check (audience in ('customer_agent', 'assistant', 'both')),
     title        text not null,
     text         text not null check (char_length(text) <= 8000),
     tsv          tsvector generated always as (to_tsvector('dutch'::regconfig, title || ' ' || text)) stored,
     embedding    vector(1024),
     embedded_at  timestamptz,
     created_at   timestamptz not null default now(),
     unique (article_id, version, ordinal)
   )`,
  "create index knowledge_chunks_embedding on knowledge_chunks using hnsw (embedding vector_cosine_ops)",
  "create index knowledge_chunks_words on knowledge_chunks using gin (workspace_id, tsv)",
  "create index knowledge_chunks_unembedded on knowledge_chunks (workspace_id, article_id) where embedding is null",
  tenantTable("knowledge_chunks", { membersOnly: true }),
  noNewcomer("knowledge_chunks"),
  //
  `create table knowledge_gaps (
     id                  text primary key,
     workspace_id        text not null references workspaces(id) on delete cascade,
     store_id            text references stores(id) on delete cascade,
     question            text not null check (char_length(question) between 1 and 500),
     question_key        text not null,
     channel             text not null check (channel in ('email', 'webchat', 'whatsapp', 'instagram', 'ask')),
     customer_label      text not null default '' check (char_length(customer_label) <= 120),
     thread_id           text,
     ticket_id           text,
     source_kind         text not null check (source_kind in ('draft', 'ask_turn', 'channel_message')),
     source_id           text,
     state               text not null default 'open' check (state in ('open', 'answered', 'dismissed')),
     target_article_id   text references knowledge_articles(id) on delete set null,
     count               integer not null default 1,
     first_seen_at       timestamptz not null default now(),
     last_seen_at        timestamptz not null default now(),
     dismissed_at        timestamptz,
     dismissed_by        text,
     resolved_article_id text references knowledge_articles(id) on delete set null,
     resolved_version    integer,
     resolved_at         timestamptz
   )`,
  "create unique index knowledge_gaps_open on knowledge_gaps (workspace_id, question_key) where state = 'open'",
  "create index knowledge_gaps_list on knowledge_gaps (workspace_id, state, last_seen_at desc)",
  "create index knowledge_gaps_target on knowledge_gaps (workspace_id, target_article_id) where state = 'open'",
  tenantTable("knowledge_gaps", { membersOnly: true }),
  noNewcomer("knowledge_gaps"),
  "revoke delete on knowledge_gaps from insyte_app",
  //
  `create table knowledge_citations (
     id           text primary key,
     workspace_id text not null references workspaces(id) on delete cascade,
     article_id   text not null references knowledge_articles(id) on delete cascade,
     version      integer not null,
     source_kind  text not null check (source_kind in ('draft', 'agent_action', 'ask_turn', 'channel_message')),
     source_id    text not null,
     at           timestamptz not null default now(),
     unique (source_kind, source_id, article_id)
   )`,
  "create index knowledge_citations_uses on knowledge_citations (workspace_id, article_id, at desc)",
  tenantTable("knowledge_citations", { membersOnly: true }),
  noNewcomer("knowledge_citations"),
  "revoke update, delete on knowledge_citations from insyte_app"
)

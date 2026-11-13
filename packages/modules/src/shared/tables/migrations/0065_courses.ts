import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * Courses (M17 step 4, PLAN 39; domain.md §16.2, §12.26): how the team learns the way the shop works.
 *
 * - `course_chapters` and `course_modules`: the catalogue's two levels, each in its own order (`position`). A chapter
 *   starts with one module ("Algemeen"). Neither is deleted from the console; a chapter or module holding a course
 *   cannot go (`restrict`), so an Undo of "Hoofdstuk toevoegen" that came too late is refused rather than cascading.
 * - `courses`: one row per course, its blocks as one ordered jsonb list (text, video, image, quiz; validated per kind by
 *   the use case, `domain/Courses.ts`), with the quiz's correct answers, which a learner never reads before checking.
 *   `draft → live ⇄ archived`, any state soft-deleted (`deleted_at`). The audience holds role ids and member ids, never
 *   role labels; `supplier_access` supplier ids. A live course edited in place changes for everyone (no versions).
 * - `course_progress`: per course and **principal** (a member now, a supplier contact once the portal exists, M16):
 *   the blocks done, the current attempt's answers, the attempts and the last score, scored on the server.
 * - `course_questions`: asked on a block (or the course), answered once, by someone who may author courses.
 *
 * Every table is the workspace's members' only for now; the supplier projection (live courses whose `supplier_access`
 * names the contact's supplier, its own progress and questions) is M16's, with the portal that reads it.
 *
 * The new `courses` permission area (M17, README §4 #10) needs a level on every role that exists: authoring borrowed
 * Team · Bewerken in the design, so each role keeps exactly what it could do (Team's level, at most Beheren). New
 * workspaces get the catalogue's defaults.
 */
export default statements(
  `create table course_chapters (
     id           text primary key,
     workspace_id text not null references workspaces(id) on delete cascade,
     title        text not null check (btrim(title) <> '' and char_length(title) <= 80),
     position     double precision not null default 0,
     created_at   timestamptz not null default now()
   )`,
  "create index course_chapters_order on course_chapters (workspace_id, position)",
  tenantTable("course_chapters", { membersOnly: true }),
  `create table course_modules (
     id           text primary key,
     workspace_id text not null references workspaces(id) on delete cascade,
     chapter_id   text not null references course_chapters(id) on delete cascade,
     title        text not null check (btrim(title) <> '' and char_length(title) <= 80),
     position     double precision not null default 0,
     created_at   timestamptz not null default now()
   )`,
  "create index course_modules_order on course_modules (chapter_id, position)",
  tenantTable("course_modules", { membersOnly: true }),
  `create table courses (
     id                text primary key,
     workspace_id      text not null references workspaces(id) on delete cascade,
     chapter_id        text not null references course_chapters(id) on delete restrict,
     module_id         text not null references course_modules(id) on delete restrict,
     position          double precision not null default 0,
     title             text not null default '' check (char_length(title) <= 120),
     description       text not null default '' check (char_length(description) <= 300),
     blocks            jsonb not null default '[]' check (jsonb_typeof(blocks) = 'array'),
     status            text not null default 'draft' check (status in ('draft', 'live', 'archived')),
     block_order       text not null default 'free' check (block_order in ('free', 'fixed')),
     audience          jsonb not null default '{"kind":"all"}',
     supplier_access   jsonb not null default '{"kind":"none"}',
     deadline          date,
     badge             text not null default 'star'
                         check (badge in ('star', 'shield', 'parcel', 'chat', 'flag', 'key')),
     pass_mark         integer not null default 80 check (pass_mark between 50 and 100),
     questions_enabled boolean not null default true,
     created_by        text not null,
     created_at        timestamptz not null default now(),
     updated_at        timestamptz not null default now(),
     published_at      timestamptz,
     deleted_at        timestamptz
   )`,
  "create index courses_catalogue on courses (workspace_id, module_id, position) where deleted_at is null",
  "create trigger courses_touch before update on courses for each row execute function touch_updated_at()",
  tenantTable("courses", { membersOnly: true }),
  `create table course_progress (
     workspace_id   text not null references workspaces(id) on delete cascade,
     course_id      text not null references courses(id) on delete cascade,
     principal_kind text not null check (principal_kind in ('member', 'supplier_contact')),
     principal_id   text not null,
     done           text[] not null default '{}',
     answers        jsonb not null default '{}' check (jsonb_typeof(answers) = 'object'),
     attempts       integer not null default 0 check (attempts >= 0),
     score          integer check (score between 0 and 100),
     started_at     timestamptz not null default now(),
     finished_at    timestamptz,
     primary key (course_id, principal_kind, principal_id)
   )`,
  "create index course_progress_principal on course_progress (workspace_id, principal_kind, principal_id)",
  tenantTable("course_progress", { membersOnly: true }),
  `create table course_questions (
     id           text primary key,
     workspace_id text not null references workspaces(id) on delete cascade,
     course_id    text not null references courses(id) on delete cascade,
     block_id     text,
     asker_kind   text not null check (asker_kind in ('member', 'supplier_contact')),
     asker_id     text not null,
     text         text not null check (btrim(text) <> '' and char_length(text) <= 2000),
     at           timestamptz not null default now(),
     answer       text check (answer is null or (btrim(answer) <> '' and char_length(answer) <= 4000)),
     answered_by  text,
     answered_at  timestamptz,
     check ((answer is null) = (answered_at is null))
   )`,
  "create index course_questions_course on course_questions (workspace_id, course_id, at desc)",
  tenantTable("course_questions", { membersOnly: true }),
  // Every role that exists gets a level in the new area: what Team allowed it, at most Beheren; the owner all of it.
  `do $$
   declare w record;
   begin
     perform set_config('app.principal_kind', 'system', true);
     for w in select id from workspaces loop
       perform set_config('app.workspace_id', w.id, true);
       update roles
          set levels = levels || jsonb_build_object('courses',
                case when id = 'owner' then 3 else least(3, greatest(0, coalesce((levels ->> 'team')::int, 0))) end)
        where workspace_id = w.id and not (levels ? 'courses');
     end loop;
     perform set_config('app.workspace_id', '', true);
     perform set_config('app.principal_kind', '', true);
   end $$`
)

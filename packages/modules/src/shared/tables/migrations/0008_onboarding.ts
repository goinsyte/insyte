import { statements } from "../statements.ts"

/**
 * Onboarding as a server-side state machine (M4.1): one row per person, track and workspace, so a reload, another
 * device or a return a week later resumes on the right step with the answers kept. User-scoped: a person reads and
 * writes only their own rows (`app_user_id()`, `Db.forUser`). `workspace_id` stays empty until the organisation step;
 * its reference to `workspaces` arrives with that table (step 3). `setup_tasks` arrives with workspaces too.
 */
export default statements(
  `create table onboarding_progress (
     id           text primary key,
     user_id      text not null references auth."user"(id) on delete cascade,
     workspace_id text,
     track        text not null check (track in ('admin', 'supplier', 'affiliate', 'invite')),
     step         text not null,
     answers      jsonb not null default '{}',
     started_at   timestamptz not null default now(),
     completed_at timestamptz,
     updated_at   timestamptz not null default now(),
     unique nulls not distinct (user_id, track, workspace_id)
   )`,
  `create trigger onboarding_progress_touch before update on onboarding_progress
     for each row execute function touch_updated_at()`,
  "alter table onboarding_progress enable row level security",
  "alter table onboarding_progress force row level security",
  `create policy onboarding_progress_own on onboarding_progress as permissive for all
     using (user_id = app_user_id()) with check (user_id = app_user_id())`
)

import { statements } from "../statements.ts"

/**
 * What happened to an account (M2.6): sign-ins and failed ones, sign-up, sign-out, password resets and changes,
 * two-factor on and off. User-level, so not `audit_events`, which needs a workspace. Kept 13 months (the retention cron
 * arrives with M17). Settings → Beveiliging reads a person's own rows (M3).
 *
 * Written while nobody is signed in yet, so inserting asks for no user context; reading shows a person only their own
 * rows (`app_user_id()`, set by `Db`). Append-only for the app. A failed sign-in for an address with no account is not
 * recorded: there is no account to tell, and the rate limits count it already.
 */
export default statements(
  `create table auth_events (
     id         text primary key,
     user_id    text not null,
     kind       text not null check (kind in ('sign_in', 'sign_in_failed', 'sign_up', 'sign_out',
                  'password_reset_requested', 'password_changed', 'two_factor_enabled', 'two_factor_disabled')),
     ip         inet,
     user_agent text,
     country    text,
     at         timestamptz not null default now()
   )`,
  "create index auth_events_user on auth_events (user_id, at desc)",
  "alter table auth_events enable row level security",
  "alter table auth_events force row level security",
  "create policy auth_events_own on auth_events as permissive for select using (user_id = app_user_id())",
  "create policy auth_events_record on auth_events as permissive for insert with check (true)",
  "revoke update, delete on auth_events from insyte_app"
)

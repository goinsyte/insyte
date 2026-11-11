import { statements } from "../statements.ts"

/*
 * Instellingen → Beveiliging, Actieve sessies (M3.3): the person's security log (`auth_events`) records a session its
 * owner signed out from another device (`session_revoked`). Where each session was opened is better-auth's column,
 * `auth.session.country` (0053, generated), filled by its session hook from Cloudflare's `cf-ipcountry`.
 */
export default statements(
  "alter table auth_events drop constraint auth_events_kind_check",
  `alter table auth_events add constraint auth_events_kind_check check (kind in ('sign_in', 'sign_in_failed', 'sign_up',
     'sign_out', 'password_reset_requested', 'password_changed', 'two_factor_enabled', 'two_factor_disabled',
     'session_revoked'))`
)

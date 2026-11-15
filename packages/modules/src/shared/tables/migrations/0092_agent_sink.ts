import { statements } from "../statements.ts"

/*
 * The agent acting on its own (M15 step 6, the agent sink). Additive.
 *
 * `email_messages.automated`: the mail says it was sent by a machine (an out-of-office, a helpdesk's receipt, a
 * mailing list): `Auto-Submitted` other than `no`, `Precedence: bulk/list/junk`, a `List-Id`, `X-Autoreply` /
 * `X-Autorespond`, or an empty `Return-Path` (RFC 3834). The agent never answers one, so two machines never mail each
 * other in a loop.
 *
 * `drafts.flags`: what a person must check in a reply draft before it goes (`money`, `figure`, `link`), set where the
 * agent wrote it for the team to read (Eerst vragen). Shown on the inbox's draft card; nothing personal.
 *
 * Four more reasons an action the agent was allowed to run went to a person, or did not happen; the check on
 * `agent_actions.refuse_reason` only widens:
 * - `hours`: the offline plan gave the action Zelf doen for while nobody is online (`first_analyses.offline`), and the
 *   team is online now, so it is theirs.
 * - `guard`: what the agent wrote failed a check it must pass to go without a person (a reply that promises money, a
 *   cancellation or a new parcel, states a figure or a link it was never given); the draft waits for the team.
 * - `taken`: by the time the reply was written or sent, the thread was no longer the agent's: the team answered or took
 *   it, a newer mail came in, or the agent had answered it already.
 * - `unclear`: the agent could not tell which of the customer's orders the mail is about, or its status is not one to
 *   send (cancelled, coming back); the team answers.
 */
export default statements(
  "alter table email_messages add column if not exists automated boolean not null default false",
  "alter table drafts add column if not exists flags text[] not null default '{}'",
  "alter table agent_actions drop constraint agent_actions_refuse_reason_check",
  `alter table agent_actions add constraint agent_actions_refuse_reason_check
     check (refuse_reason in ('policy', 'scope', 'role', 'locked', 'budget', 'disabled', 'limit', 'unknown', 'hours',
                              'guard', 'taken', 'unclear'))`
)

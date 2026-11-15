import { statements } from "../statements.ts"

/*
 * The agent acting on its own (M15 step 6, the agent sink): two more reasons an action it was allowed to run went to a
 * person instead. Additive: the check on `agent_actions.refuse_reason` only widens.
 *
 * - `hours`: the offline plan gave the action Zelf doen for while nobody is online (`first_analyses.offline`), and the
 *   team is online now, so it is theirs.
 * - `guard`: what the agent wrote failed a check it must pass to go without a person (a reply that promises money, or
 *   states a figure it was never given); the draft waits for the team instead.
 */
export default statements(
  "alter table agent_actions drop constraint agent_actions_refuse_reason_check",
  `alter table agent_actions add constraint agent_actions_refuse_reason_check
     check (refuse_reason in ('policy', 'scope', 'role', 'locked', 'budget', 'disabled', 'limit', 'unknown', 'hours',
                              'guard'))`
)

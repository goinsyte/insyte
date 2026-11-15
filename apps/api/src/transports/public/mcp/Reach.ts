import { InsyteTools } from "@insyte/api/mcp/McpTools"
import { ForAgents, type Need, Needs } from "@insyte/api/mcp/Shared"
import { Db } from "@insyte/database/Db"
import type { AgentActionId } from "@insyte/domain/AgentActions"
import { canRole } from "@insyte/domain/Permissions"
import { CurrentPrincipal, type Principal } from "@insyte/domain/Principal"
import { Context, Effect } from "effect"
import { McpServer, Tool } from "effect/ai"

/*
 * Per-key `tools/list` (M19.3): a key is shown the tools it can call, and no other. What a tool needs is its own
 * annotation (`Needs` and `ForAgents` in `@insyte/api/mcp/Shared`): every area and special its use case asks for, met
 * by the key's role as `Policy.require` meets it (`canRole`), and for an agent's key, how the tool meets the autonomy
 * rules: refused (`notForAgents`) is hidden, and so is one whose every action the workspace has set to Nooit. An agent
 * that asks first files a proposal, which needs only what reading the record does: a governed tool is named to an
 * agent that can read what it acts on while one of its actions asks first, and to one that has its scopes when they all
 * run (Zelf doen), as the run then asks for them.
 *
 * Only the list is filtered. A call of a tool the list leaves out is answered as before, by the use case or the agents'
 * rule (`ScopeMissingV1`, `ActionNotAllowedV1`), so a client that calls by name hears why, not "unknown tool".
 */

type Decision = "run" | "propose" | "refuse"

/** What the workspace's rules decide for an agent per action, read once per request and only if a list asks. */
export class AgentDecisions extends Context.Service<AgentDecisions, Effect.Effect<ReadonlyMap<string, Decision>>>()(
  "api-worker/AgentDecisions"
) {}

const ACTIONS: ReadonlyArray<AgentActionId> = [
  ...new Set(
    Object.values(InsyteTools.tools).flatMap((tool) => {
      const reach = Context.get(tool.annotations, ForAgents)
      return reach.kind === "governed" ? reach.actions ?? [] : []
    })
  )
]

/**
 * For the key door: what `autonomy_decide` answers for the tools' actions, as the agent (it reads no policy table
 * itself), memoised for the request. Not an agent's key, or a read that fails: nothing is known, so every governed tool
 * is named as asking first, and each call still goes through the rules.
 */
export const agentDecisions: Effect.Effect<
  Effect.Effect<ReadonlyMap<string, Decision>>,
  never,
  Db | CurrentPrincipal
> = Effect.gen(function*() {
  const principal = yield* CurrentPrincipal
  const none: ReadonlyMap<string, Decision> = new Map()
  if (principal.kind !== "agent") return Effect.succeed(none)
  const db = yield* Db
  return yield* Effect.cached(
    db.scoped((sql) =>
      sql<{ action: string; decision: Decision }>`
        select a.action, d.decision
        from unnest(${ACTIONS}::text[]) as a(action), lateral autonomy_decide(a.action, null) d`
    ).pipe(
      Effect.map((rows): ReadonlyMap<string, Decision> => new Map(rows.map((r) => [r.action, r.decision]))),
      Effect.provideService(CurrentPrincipal, principal),
      Effect.catchCause((cause) =>
        Effect.as(Effect.logWarning("mcp: the agent's rules could not be read", cause), none)
      )
    )
  )
})

const meets = (role: Principal["role"], need: Need) => {
  const permissions = { ...role, stores: role.stores === "all" ? "all" as const : [...role.stores] }
  return "special" in need ? canRole(permissions, need.special) : canRole(permissions, need.area, need.level)
}

const TOOLS: Readonly<Record<string, Tool.Any>> = InsyteTools.tools

/** Reading what the tool acts on: each area at read, no special. */
const reading = (needs: ReadonlyArray<Need>): ReadonlyArray<Need> =>
  needs.flatMap((need) => "special" in need ? [] : [{ area: need.area, level: 1 as const }])

/** Whether `tools/list` names the tool to this key. */
const listed = (name: string) =>
  Effect.gen(function*() {
    const tool = TOOLS[name]
    if (tool === undefined) return true
    const principal = yield* CurrentPrincipal
    const needs = Context.get(tool.annotations, Needs)
    const has = (all: ReadonlyArray<Need>) => all.every((need) => meets(principal.role, need))
    if (principal.kind !== "agent" || Context.get(tool.annotations, Tool.Readonly)) return has(needs)
    const reach = Context.get(tool.annotations, ForAgents)
    if (reach.kind === "refused" || !has(reading(needs))) return false
    if (reach.actions === null) return true
    const decisions = yield* yield* AgentDecisions
    const decided = reach.actions.map((action) => decisions.get(action) ?? "propose")
    if (decided.every((d) => d === "refuse")) return false
    return decided.includes("propose") || has(needs)
  })

/** The tools' visibility per key: on `tools/list` only; every other method sees every tool, as before. */
export const ToolReach = McpServer.visibility(({ method, target }) =>
  method === "tools/list" ? listed(target) : Effect.succeed(true)
)

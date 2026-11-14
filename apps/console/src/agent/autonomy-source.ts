import { useAtomRefresh, useAtomSet } from "@effect/atom-react"
import type { AiBudgets, AutonomyPolicy } from "@insyte/modules/agent/domain/Autonomy"
import type { AutonomySource } from "@insyte/ui/app/ai/autonomy-source"
import { normalise, type Policy } from "@insyte/ui/app/lib/autonomy"
import { undoable } from "@insyte/ui/app/lib/undo"
import { Exit } from "effect"
import { useMemo } from "react"
import { toast } from "sonner"
import { agentWrites, AUTONOMY, autonomyAtom } from "../data/agent.ts"
import { failureOf, sayRefusal, useGate } from "../frame/refusals.ts"

/*
 * Zelfstandigheid in the console (M15 step 6): `Autonomy.get` as the design's policy, saved through `Autonomy.set` on
 * the version it was read at, with its undo (which writes the previous version again). Someone else's save in the
 * meantime is said, and the page reads again; a locked action at Zelf doen cannot be chosen, but is said if it comes.
 * The budget is the month's model calls against the workspace's limit (M15 step 1); it links to Limieten and to Wat
 * Insyte deed, both in the console.
 */

const notSaved = (error: unknown, refresh: () => void) => {
  const tag = (error as { _tag?: string })._tag
  if (tag === "AutonomyStale") {
    refresh()
    return void toast.error("Iemand anders heeft net opgeslagen", {
      description: "Je ziet nu de nieuwste regels. Pas ze opnieuw aan als dat nog nodig is."
    })
  }
  if (tag === "AutonomyLocked") {
    return void toast.error("Deze actie vraagt altijd eerst", {
      description: "Wat de andere kant niet kan terugdraaien, kan niet op Zelf doen."
    })
  }
  sayRefusal(error, { gone: "Deze regels bestaan niet meer" })
}

export function useConsoleAutonomySource(policy: AutonomyPolicy, budgets: AiBudgets | undefined): AutonomySource {
  const set = useAtomSet(agentWrites.setAutonomy, { mode: "promiseExit" })
  const reset = useAtomSet(agentWrites.resetAutonomy, { mode: "promiseExit" })
  const undo = useAtomSet(agentWrites.undo, { mode: "promiseExit" })
  const refresh = useAtomRefresh(autonomyAtom)
  const gate = useGate("ai.autonomy")
  const levels = useMemo(() => normalise(policy.levels), [policy.levels])
  const history = useMemo(
    () =>
      policy.history.map((h) => ({
        id: `v${h.version}`,
        at: new Date(h.at).toISOString(),
        by: h.by ?? "Insyte",
        version: h.version,
        changes: h.changes
      })),
    [policy.history]
  )
  const limit = budgets?.workspace.limit ?? null
  const used = budgets?.workspace.used ?? 0

  const after = async (
    exit: Exit.Exit<{ readonly undo: { readonly token: string } | null }, unknown>,
    label: string,
    detail: string
  ) => {
    if (Exit.isFailure(exit)) {
      notSaved(failureOf(exit), refresh)
      return false
    }
    const token = exit.value.undo?.token
    if (token === undefined) return true
    undoable(label, () =>
      void undo({ payload: { token }, reactivityKeys: [...AUTONOMY] }).then((done) => {
        if (Exit.isFailure(done)) toast.error("Te laat om ongedaan te maken")
      }), detail)
    return true
  }

  return {
    policy: levels,
    version: policy.version,
    history,
    budget: { used, limit },
    spent: limit !== null && (limit === 0 || used >= limit),
    gate,
    pages: { limits: true, activity: true },
    save: async (next: Policy) =>
      after(
        await set({ payload: { levels: next, baseVersion: policy.version }, reactivityKeys: [...AUTONOMY] }),
        `Zelfstandigheid opgeslagen · versie ${policy.version + 1}`,
        "Vanaf nu werkt Insyte volgens deze regels. Elke wijziging staat in de geschiedenis."
      ),
    restore: async () =>
      after(
        await reset({ payload: { baseVersion: policy.version }, reactivityKeys: [...AUTONOMY] }),
        "Zelfstandigheid staat weer op de standaard",
        "Alles komt weer eerst als voorstel bij jou."
      )
  }
}

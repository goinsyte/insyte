import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { AiBudgets } from "@insyte/modules/agent/domain/Autonomy"
import type { LimitsDraft, LimitsSource } from "@insyte/ui/app/ai/limits-source"
import { undoable } from "@insyte/ui/app/lib/undo"
import { Exit, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useMemo } from "react"
import { toast } from "sonner"
import { agentWrites, AI_BUDGETS } from "../data/agent.ts"
import { frameAtom } from "../data/frame.ts"
import { failureOf, sayRefusal, useGate } from "../frame/refusals.ts"

/*
 * Limieten in the console (M15 step 6): `AiBudget.get` as the design's budgets, each person by their name and role in
 * the frame, saved through `AiBudget.setMany` with only the limits that changed, and its undo (which puts them all
 * back). Read by the whole team, changed with `ai.autonomy`. What was used is the month's model calls in euros.
 */

const notSaved = (error: unknown) =>
  sayRefusal(error, {
    gone: "Deze persoon is niet meer in het team",
    other: (tagged) => {
      if (tagged._tag !== "BudgetInvalid") return false
      toast.error(
        tagged["reason"] === "member_not_found" ? "Deze persoon is niet meer in het team" : "Dat bedrag kan niet",
        {
          description: tagged["reason"] === "member_not_found"
            ? "Laad de pagina opnieuw en sla de andere limieten nog eens op."
            : "Een limiet is een heel bedrag in euro, of leeg voor geen limiet."
        }
      )
      return true
    }
  })

export function useConsoleLimitsSource(budgets: AiBudgets): LimitsSource {
  const set = useAtomSet(agentWrites.setBudgets, { mode: "promiseExit" })
  const undo = useAtomSet(agentWrites.undo, { mode: "promiseExit" })
  const gate = useGate("ai.autonomy")
  const frame = Option.getOrUndefined(AsyncResult.value(useAtomValue(frameAtom)))
  const people = useMemo(() => {
    const team = new Map(frame?.teammates.map((t) => [t.id, t]) ?? [])
    return budgets.people.map((p) => ({
      memberId: p.memberId,
      name: team.get(p.memberId)?.name ?? "Iemand",
      role: team.get(p.memberId)?.roleLabel ?? "",
      limit: p.limit,
      used: p.used
    }))
  }, [budgets.people, frame])

  const save = async (draft: LimitsDraft) => {
    const entries = [
      ...(draft.limit === budgets.workspace.limit ? [] : [{ scope: "workspace", limit: draft.limit }]),
      ...budgets.people.flatMap((p) => {
        const limit = draft.people[p.memberId] ?? null
        return limit === p.limit ? [] : [{ scope: p.memberId, limit }]
      })
    ]
    if (entries.length === 0) return true
    const exit = await set({ payload: { entries }, reactivityKeys: [...AI_BUDGETS] })
    if (Exit.isFailure(exit)) {
      notSaved(failureOf(exit))
      return false
    }
    const token = exit.value.undo?.token
    if (token === undefined) return true
    undoable(
      "Limieten opgeslagen",
      () =>
        void undo({ payload: { token }, reactivityKeys: [...AI_BUDGETS] }).then((done) => {
          if (Exit.isFailure(done)) toast.error("Te laat om ongedaan te maken")
        })
    )
    return true
  }

  return {
    budget: { limit: budgets.workspace.limit, used: budgets.workspace.used },
    background: budgets.background,
    people,
    gate,
    save
  }
}

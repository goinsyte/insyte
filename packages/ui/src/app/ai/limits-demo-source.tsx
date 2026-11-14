import { type ReactNode, useMemo } from "react"
import { undoable } from "../lib/undo"
import { useGate } from "../stores/access-store"
import { useAutonomy } from "../stores/autonomy-store"
import { useWorkspace } from "../stores/workspace-store"
import { type LimitsPerson, type LimitsSource, LimitsSourceProvider } from "./limits-source"

/** The design app's Limieten: its autonomy store's budgets, each person by their name in the workspace store. */
function useDemoLimitsSource(): LimitsSource {
  const budget = useAutonomy((s) => s.budget)
  const budgets = useAutonomy((s) => s.people)
  const background = useAutonomy((s) => s.background)
  const members = useWorkspace((s) => s.members)
  const gate = useGate("ai.autonomy")
  const people = useMemo(
    () =>
      budgets.flatMap((p): LimitsPerson[] => {
        const m = members.find((x) => x.id === p.memberId)
        return m ? [{ ...p, name: m.name, role: m.role }] : []
      }),
    [budgets, members]
  )
  return {
    budget,
    background,
    people,
    gate,
    save: (draft) => {
      const before = { budget: { ...budget }, people: budgets.map((p) => ({ ...p })) }
      const s = useAutonomy.getState()
      s.setBudgetLimit(draft.limit)
      for (const p of budgets) {
        if (draft.people[p.memberId] !== p.limit) s.setPersonLimit(p.memberId, draft.people[p.memberId] ?? null)
      }
      undoable("Limieten opgeslagen", () => useAutonomy.setState({ budget: before.budget, people: before.people }))
      return Promise.resolve(true)
    }
  }
}

/** The design app's provider around the page. */
export function DemoLimitsSource({ children }: { children: ReactNode }) {
  return <LimitsSourceProvider value={useDemoLimitsSource()}>{children}</LimitsSourceProvider>
}

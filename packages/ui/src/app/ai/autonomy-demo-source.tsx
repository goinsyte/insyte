import type { ReactNode } from "react"
import { useMyName } from "../ask/agent-parts"
import { DEFAULT_POLICY } from "../lib/autonomy"
import { undoable } from "../lib/undo"
import { useGate } from "../stores/access-store"
import { useAutonomy, workspaceSpent } from "../stores/autonomy-store"
import { type AutonomySource, AutonomySourceProvider } from "./autonomy-source"

/** The design app's Zelfstandigheid: its autonomy store, kept in the browser, with the toast's Undo. */
function useDemoAutonomySource(): AutonomySource {
  const policy = useAutonomy((s) => s.policy)
  const version = useAutonomy((s) => s.version)
  const history = useAutonomy((s) => s.history)
  const spent = useAutonomy(workspaceSpent)
  const budget = useAutonomy((s) => s.budget)
  const me = useMyName()
  const gate = useGate("ai.autonomy")
  return {
    policy,
    version,
    history,
    budget,
    spent,
    gate,
    pages: { limits: true, activity: true },
    save: (next) => {
      const undo = useAutonomy.getState().savePolicy(next, me)
      undoable(
        `Zelfstandigheid opgeslagen · versie ${version + 1}`,
        undo,
        "Vanaf nu werkt Insyte volgens deze regels. Elke wijziging staat in de geschiedenis."
      )
      return Promise.resolve(true)
    },
    restore: () => {
      const undo = useAutonomy.getState().savePolicy(DEFAULT_POLICY, me)
      undoable("Zelfstandigheid staat weer op de standaard", undo, "Alles komt weer eerst als voorstel bij jou.")
      return Promise.resolve(true)
    }
  }
}

/** The design app's provider around the page. */
export function DemoAutonomySource({ children }: { children: ReactNode }) {
  return <AutonomySourceProvider value={useDemoAutonomySource()}>{children}</AutonomySourceProvider>
}

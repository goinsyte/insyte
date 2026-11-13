import { createContext, useContext } from "react"
import type { Policy, PolicyHistoryEntry } from "../lib/autonomy"

/**
 * What Instellingen → Insyte AI → Zelfstandigheid reads and does, from whoever hosts it (as
 * `settings/notifications-source.tsx` is for Meldingen): the design app from its autonomy store, the console from
 * `Autonomy.get` and `.set` (M15 step 6). A save names the version it was made on; the host says what it did (with its
 * Undo) or why it did not, and resolves whether it saved, so a draft that did not go stays as it was.
 */
export interface AutonomySource {
  policy: Policy
  /** The version in force. */
  version: number
  history: ReadonlyArray<PolicyHistoryEntry>
  /** The month's AI budget, for the notice when it is spent. */
  budget: { used: number; limit: number | null }
  spent: boolean
  save: (next: Policy) => Promise<boolean>
  /** Whether the viewer may change the rules (`ai.autonomy`), and why not. */
  gate: { ok: boolean; reason: string }
  /** Which of the pages it links to the host has yet: Limieten, Wat Insyte deed. */
  pages: { limits: boolean; activity: boolean }
  /** "Standaard herstellen": every action back to Eerst vragen. */
  restore: () => Promise<boolean>
}

const Context = createContext<AutonomySource | null>(null)

export const AutonomySourceProvider = Context.Provider

export function useAutonomySource(): AutonomySource {
  const source = useContext(Context)
  if (source === null) throw new Error("Zelfstandigheid needs an AutonomySourceProvider around it.")
  return source
}

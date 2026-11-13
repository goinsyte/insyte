import { createContext, type ReactNode, useContext } from "react"
import type { TrashItem } from "../lib/settings-depth"

/**
 * What Instellingen → Prullenbak reads and does, from whoever hosts it: the design app from its settings-depth store,
 * the console from `Trash.list`, `.restore`, `.purge` and `.empty` (M17 step 20.1a). Putting back says so with
 * Ongedaan maken; purging and emptying are asked first by the page and have no undo (ADR-0023).
 */
export interface TrashSource {
  /** Newest first, each inside its 30 days. */
  items: ReadonlyArray<TrashItem>
  /** The role may put back and purge here. */
  canEdit: boolean
  /** "Terugzetten": the host says it with Ongedaan maken. */
  restore: (items: ReadonlyArray<TrashItem>) => void
  /** "Definitief verwijderen", confirmed. */
  purge: (items: ReadonlyArray<TrashItem>) => void
  /** "Prullenbak legen", confirmed. */
  empty: () => void
}

const TrashContext = createContext<TrashSource | null>(null)

export function TrashSourceProvider({ value, children }: { value: TrashSource; children: ReactNode }) {
  return <TrashContext.Provider value={value}>{children}</TrashContext.Provider>
}

export function useTrashSource(): TrashSource {
  const source = useContext(TrashContext)
  if (source === null) throw new Error("useTrashSource outside a TrashSourceProvider")
  return source
}

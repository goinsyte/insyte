import { createContext, useContext } from "react"

/** One person's line on Limieten: who, their limit (`null` is none) and what they used this month, in euros. */
export type LimitsPerson = { memberId: string; name: string; role: string; limit: number | null; used: number }

/** What a save sends: the workspace's limit and each person's, in whole euros; `null` is no limit. */
export type LimitsDraft = { limit: number | null; people: Record<string, number | null> }

/**
 * What Instellingen → Insyte AI → Limieten reads and does, from whoever hosts it (as `autonomy-source.tsx` is for
 * Zelfstandigheid): the design app from its autonomy and workspace stores, the console from `AiBudget.get` and
 * `.setMany` (M15 step 6). A save resolves whether it went, with the host's Undo; a draft that did not go stays.
 */
export interface LimitsSource {
  /** The workspace's limit and the month's use, in euros. */
  budget: { limit: number | null; used: number }
  /** What work without a person (the background, the customer agent) spent this month, in euros. */
  background: number
  people: ReadonlyArray<LimitsPerson>
  /** Whether the viewer may change the limits (`ai.autonomy`), and why not. */
  gate: { ok: boolean; reason: string }
  save: (draft: LimitsDraft) => Promise<boolean>
}

const Context = createContext<LimitsSource | null>(null)

export const LimitsSourceProvider = Context.Provider

export function useLimitsSource(): LimitsSource {
  const source = useContext(Context)
  if (source === null) throw new Error("Limieten needs a LimitsSourceProvider around it.")
  return source
}

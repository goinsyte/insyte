import { createContext, type ReactNode, useContext } from "react"

/**
 * What Instellingen → Beveiliging reads and does, from whoever hosts it (as `workspace-source.tsx` is for Account and
 * Regio): the design app from its settings store and seeded sessions, the console from `Session.*` and
 * `Workspaces.getSecurity` (M3.3). The markup is the design's. What the host cannot do yet is absent, and the screen
 * says so rather than pretending.
 */

/** One signed-in session as the list shows it: "MacBook Pro · Chrome", "Amsterdam, NL · Nu actief". */
export interface SessionRow {
  id: string
  device: string
  location: string
  last: string
  current: boolean
}

export interface SecuritySource {
  /** The reader's own second step at sign-in. */
  twoFactor: boolean
  /** Every member must sign in with a second step. */
  requireMfa: boolean
  /** Members sign in through Google Workspace. */
  googleSso: boolean
  setTwoFactor?: (on: boolean) => void
  setRequireMfa?: (on: boolean) => void
  setGoogleSso?: (on: boolean) => void
  sessions: ReadonlyArray<SessionRow>
  /** Signs a session out; answers whether it took, and says why where it did not. */
  revoke: (session: SessionRow) => Promise<boolean>
  /** Brings a session back, where the host can (the demo's Ongedaan maken). Absent: a signed-out session stays out. */
  restore?: (id: string) => void
  /** The audit log as a CSV. */
  exportAudit?: () => void
}

const SecurityContext = createContext<SecuritySource | null>(null)

export function SecuritySourceProvider({ value, children }: { value: SecuritySource; children: ReactNode }) {
  return <SecurityContext.Provider value={value}>{children}</SecurityContext.Provider>
}

export function useSecuritySource(): SecuritySource {
  const source = useContext(SecurityContext)
  if (source === null) throw new Error("useSecuritySource outside a SecuritySourceProvider")
  return source
}

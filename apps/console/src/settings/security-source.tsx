import { useAtomSet } from "@effect/atom-react"
import type { ActiveSession } from "@insyte/domain/Session"
import type { SecurityPolicy } from "@insyte/modules/workspaces/domain/Security"
import { formatRelative, ZONE } from "@insyte/ui/app/lib/format"
import type { SecuritySource, SessionRow } from "@insyte/ui/app/settings/security-source"
import { Exit } from "effect"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { revokeSession, SESSIONS } from "../data/security.ts"
import { failureOf, sayRefusal } from "../frame/refusals.ts"

/*
 * Beveiliging over `Workspaces.getSecurity` and `Session.*` (M3.3). The person's sessions are real: each signed out
 * leaves the list at once and cannot come back, so there is no Ongedaan maken. The switches show where the workspace
 * and the reader stand, and are left out (the page says not yet): enrolling in two-factor needs a step the design does
 * not have, requiring it waits for that and for its check at sign-in, and Google SSO for its domains and that check.
 * The audit log's export comes with M17.
 */

const countries = new Intl.DisplayNames(["nl"], { type: "region" })

const day = (value: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(value)

/**
 * When a session was last seen, by the day: it renews at most daily, so an hour would claim more than is known. Named
 * in Insyte's zone, so the server's render and the browser's agree.
 */
const lastSeen = (session: ActiveSession, now: Date) => {
  if (session.current) return "Nu actief"
  const at = new Date(session.lastActiveAt)
  const yesterday = new Date(now.getTime() - 86_400_000)
  if (day(at) === day(now)) return "Vandaag"
  if (day(at) === day(yesterday)) return "Gisteren"
  const relative = formatRelative(at)
  return relative.charAt(0).toUpperCase() + relative.slice(1)
}

const rowOf = (session: ActiveSession, now: Date): SessionRow => ({
  id: session.id,
  device: session.device,
  location: session.country === null ? "Locatie onbekend" : (countries.of(session.country) ?? session.country),
  last: lastSeen(session, now),
  current: session.current
})

export function useConsoleSecuritySource(
  policy: SecurityPolicy,
  sessions: ReadonlyArray<ActiveSession>
): SecuritySource {
  const revoke = useAtomSet(revokeSession, { mode: "promiseExit" })
  // Signed out here: gone from the list before the refetch arrives.
  const [gone, setGone] = useState<ReadonlyArray<string>>([])
  const rows = useMemo(() => {
    const now = new Date()
    return sessions.filter((s) => !gone.includes(s.id)).map((s) => rowOf(s, now))
  }, [sessions, gone])
  return {
    twoFactor: policy.twoFactorEnabled,
    requireMfa: policy.requireMfa,
    googleSso: policy.googleSso,
    sessions: rows,
    revoke: async (session) => {
      const exit = await revoke({ payload: { id: session.id }, reactivityKeys: [...SESSIONS] })
      if (Exit.isFailure(exit)) {
        sayRefusal(failureOf(exit), {
          gone: "Die sessie is al uitgelogd",
          other: (tagged) => {
            if (tagged._tag === "NotFound") {
              setGone((ids) => [...ids, session.id])
              toast.error("Die sessie is al uitgelogd", { description: "Ze staat niet meer in de lijst." })
              return true
            }
            if (tagged._tag === "Invalid") {
              toast.error("Dit is je huidige sessie", { description: "Log uit om deze sessie te beëindigen." })
              return true
            }
            return false
          }
        })
        return false
      }
      setGone((ids) => [...ids, session.id])
      return true
    }
  }
}

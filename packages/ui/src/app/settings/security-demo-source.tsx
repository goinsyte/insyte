import type { ReactNode } from "react"
import { exportCsv } from "../lib/bulk"
import { useSettings } from "../stores/settings-store"
import { type SecuritySource, SecuritySourceProvider } from "./security-source"

/*
 * Beveiliging over the design app's settings store, as it was before the seam (`security-source.tsx`): the switches
 * flip at once, the seeded sessions sign out with Ongedaan maken, and Exporteren writes the seeded trail.
 */

const SESSIONS = [
  { id: "mac-chrome", device: "MacBook Pro · Chrome", location: "Amsterdam, NL", last: "Nu actief", current: true },
  {
    id: "iphone-safari",
    device: "iPhone 15 · Safari",
    location: "Amsterdam, NL",
    last: "2 uur geleden",
    current: false
  },
  { id: "linux-firefox", device: "Linux · Firefox", location: "Berlin, DE", last: "Gisteren", current: false }
]

/** The trail the Export button writes out. Seeded, like the rest of the demo. */
const AUDIT = [
  ["2026-10-27 18:42", "Elena Hart", "Rol gewijzigd", "Financiën kan nu chargeback-bewijs indienen", "Amsterdam, NL"],
  ["2026-10-27 09:15", "Elena Hart", "API-sleutel aangemaakt", "Magazijnsynchronisatie", "Amsterdam, NL"],
  ["2026-10-26 16:03", "Ethan Jeppesen", "Bestelling terugbetaald", "Bestelling #1042, US$ 89,00", "Berlin, DE"],
  ["2026-10-25 11:20", "Elena Hart", "App geïnstalleerd", "Klaviyo", "Amsterdam, NL"],
  [
    "2026-10-24 14:58",
    "Sofía Kim",
    "Teamlid uitgenodigd",
    "liam@northwindclothing.co als Klantenservice",
    "Amsterdam, NL"
  ],
  ["2026-10-22 08:31", "Elena Hart", "Tweestapsverificatie ingeschakeld", "Hele werkruimte", "Amsterdam, NL"],
  ["2026-10-19 19:47", "Ethan Jeppesen", "Klanten geëxporteerd", "1.284 rijen", "Berlin, DE"],
  ["2026-10-15 10:02", "Elena Hart", "Winkel gekoppeld", "Northwind EU", "Amsterdam, NL"]
] as const

export function DemoSecuritySource({ children }: { children: ReactNode }) {
  const mfa = useSettings((s) => s.mfa)
  const enforce = useSettings((s) => s.enforceMfa)
  const sso = useSettings((s) => s.sso)
  const setAuth = useSettings((s) => s.setAuth)
  const revoked = useSettings((s) => s.revokedSessions)
  const revokeSession = useSettings((s) => s.revokeSession)
  const restoreSession = useSettings((s) => s.restoreSession)
  const source: SecuritySource = {
    twoFactor: mfa,
    requireMfa: enforce,
    googleSso: sso,
    setTwoFactor: (on) => setAuth({ mfa: on }),
    setRequireMfa: (on) => setAuth({ enforceMfa: on }),
    setGoogleSso: (on) => setAuth({ sso: on }),
    sessions: SESSIONS.filter((s) => !revoked.includes(s.id)),
    revoke: (session) => {
      revokeSession(session.id)
      return Promise.resolve(true)
    },
    restore: restoreSession,
    exportAudit: () => exportCsv("insyte-audit-log", ["Tijd", "Teamlid", "Actie", "Detail", "Locatie"], AUDIT)
  }
  return <SecuritySourceProvider value={source}>{children}</SecuritySourceProvider>
}

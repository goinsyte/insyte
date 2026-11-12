import { useMemo } from "react"
import { type Month, MONTHS } from "../lib/analytics/engine"
import type { Channel } from "../lib/analytics/history"
import { costOf, disputedOf, figuresOf, MONTH_IDS, ordersOf, refundedOf, revenueOf } from "../lib/costs"
import { type Figures, METRICS, type SheetError } from "../lib/sheets"
import { useCosts } from "../stores/costs-store"
import { useWorkspace } from "../stores/workspace-store"

/** The workspace's money is the store history's money, so a sheet and Analyse agree to the cent. */
export const SHEET_CURRENCY = "USD"

const LATEST: Month = MONTH_IDS[MONTH_IDS.length - 1]!

/** "2026-04", "apr", "april" or nothing (the latest month) → the month, or why not. */
export function monthOf(arg: string | undefined): Month | SheetError {
  if (!arg) return LATEST
  const a = arg.trim().toLowerCase()
  const hit = MONTHS.find((m) => m.id === a || m.abbr === a || m.label.toLowerCase() === a)
  return hit
    ? hit.id
    : {
      error: "#N/B",
      why: `Insyte heeft geen cijfers voor “${arg}”. Kies een maand van januari tot mei 2026, zoals "2026-04" of "apr".`
    }
}

const CHANNEL: Record<string, Channel> = {
  omzet_meta: "Meta ads",
  omzet_google: "Google",
  omzet_klaviyo: "Klaviyo",
  omzet_organisch: "Organic"
}

/** INSYTE() for the workspace as it stands: its history, its costs, and which ad accounts report. */
export function useFigures(): Figures {
  const lines = useCosts((s) => s.lines)
  const integrations = useWorkspace((s) => s.integrations)
  return useMemo(() => {
    const connected = new Set(integrations.filter((i) => i.status === "connected").map((i) => i.key))
    return (metric, monthArg) => {
      const m = monthOf(monthArg)
      if (typeof m !== "string") return m
      const id = metric.trim().toLowerCase()
      if (!METRICS.some((x) => x.id === id)) {
        return { error: "#NAAM?", why: `Insyte kent het cijfer “${metric}” niet. Kies er een via Koppelen aan Insyte.` }
      }
      if (CHANNEL[id]) return revenueOf(m, CHANNEL[id])
      const f = figuresOf(lines, m, connected)
      switch (id) {
        case "omzet":
          return f.revenue
        case "bestellingen":
          return ordersOf(m)
        case "gemiddelde_bestelling":
          return f.orders ? f.revenue / f.orders : 0
        case "terugbetaald":
          return refundedOf(m)
        case "chargebacks":
          return disputedOf(m)
        case "advertentiekosten":
          return f.ads
        case "overige_kosten":
          return f.other
        case "kosten":
          return f.costs
        case "nettowinst":
          return f.net
        case "marge":
          return f.margin
        case "roas":
          return f.ads
            ? f.roas
            : { error: "#DEEL/0!", why: "Er zijn in deze maand geen advertentiekosten, dus er is geen ROAS." }
        case "advertenties_meta":
        case "advertenties_google": {
          const src = id === "advertenties_meta" ? "meta" : "google-ads"
          return lines.filter((l) => l.kind === "ads" && l.source === src).reduce(
            (n, l) => n + costOf(l, m, connected),
            0
          )
        }
      }
      return { error: "#N/B", why: "Dit cijfer is er nog niet." }
    }
  }, [lines, integrations])
}

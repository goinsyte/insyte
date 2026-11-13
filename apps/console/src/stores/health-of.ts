import {
  BROKEN,
  type ConnectionHealth,
  findingSentence,
  handlingSentence,
  type HealthLine,
  type IncidentKind,
  remedySentence,
  triedSentence
} from "@insyte/modules/stores/domain/Health"
import type { StoreHealth, StoreIncident, SyncLine } from "@insyte/ui/app/lib/types/sync-health"

/*
 * Sync health in the console's words (M17 step 6): a connection from `Connections.health` as Winkels shows it under
 * its row, and `Shell.health` as the top bar's one line. The sentences are the module's (`stores/domain/Health.ts`),
 * so the row, the bell, the mail and Start say the same; only the times and the short words are worked out here.
 */

const ZONE = "Europe/Amsterdam"
const clock = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: ZONE })
const dayClock = new Intl.DateTimeFormat("nl-NL", {
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: ZONE
})
const today = new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeZone: ZONE })

/** "03:12" today, "ma 03:12" on another day. */
const when = (at: number, now: number) =>
  today.format(at) === today.format(now) ? clock.format(at) : dayClock.format(at).replace(" om", "")

const STATE: Record<ConnectionHealth["state"], Pick<StoreHealth, "tone" | "label">> = {
  ok: { tone: "success", label: "Gesynchroniseerd" },
  warning: { tone: "warning", label: "Let op" },
  broken: { tone: "danger", label: "Actie nodig" },
  importing: { tone: "info", label: "Importeren" },
  disconnected: { tone: "danger", label: "Niet gekoppeld" }
}

const incidentOf = (i: ConnectionHealth["incidents"][number], now: number): StoreIncident => ({
  id: i.id,
  tone: BROKEN.has(i.kind) ? "danger" : "warning",
  finding: findingSentence(i.kind, i.facts, now),
  next: handlingSentence(i.kind) ?? remedySentence(i.kind),
  tried: i.tried.map((t) => ({ at: when(t.at, now), text: triedSentence(t) })),
  since: `Sinds ${when(i.openedAt, now)}`,
  told: i.notified === null ? null : `Gemeld aan ${i.notified}`,
  resolved: i.resolvedAt === null ?
    null :
    `Opgelost ${today.format(i.resolvedAt) === today.format(now) ? "om " : ""}${when(i.resolvedAt, now)}`
})

/** A connection as Winkels shows it. */
export const storeHealthOf = (c: ConnectionHealth, now = Date.now()): StoreHealth => ({
  ...STATE[c.state],
  synced: c.lastSyncedAt === null ?
    null :
    `Gesynchroniseerd ${today.format(c.lastSyncedAt) === today.format(now) ? "om " : ""}${when(c.lastSyncedAt, now)}`,
  incidents: c.incidents.map((i) => incidentOf(i, now)),
  reconnect: c.state === "broken" &&
    c.incidents.some((i) => i.resolvedAt === null && remedySentence(i.kind) !== null)
})

/** What needs attention, in a few words after the store's name. */
const SHORT: Record<IncidentKind | "action_required", string> = {
  webhook_gap: "webhooks achter",
  token_expiring: "toegang verloopt",
  token_expired: "toegang verlopen",
  scope_missing: "rechten missen",
  rate_limited: "limiet bijna op",
  sync_failed: "sync lukt niet",
  action_required: "opnieuw koppelen"
}

/** The top bar's line; `null` without a store. */
export const syncLineOf = (line: HealthLine, now = Date.now()): SyncLine | null => {
  if (line.state === "none") return null
  const synced = line.lastSyncedAt === null ? "" : ` Laatst om ${when(line.lastSyncedAt, now)}.`
  if (line.state === "ok" || line.state === "importing" || line.attention.length === 0) {
    const one = line.stores === 1
    return {
      tone: "ok",
      label: line.state === "importing"
        ? (one ? "Winkel wordt geïmporteerd" : "Winkels worden geïmporteerd")
        : (one ? "Winkel gesynchroniseerd" : "Winkels gesynchroniseerd"),
      detail: line.state === "importing"
        ? "Insyte importeert je winkel."
        : `${one ? "Je winkel is" : "Al je winkels zijn"} gesynchroniseerd.${synced}`,
      href: "/settings/stores"
    }
  }
  const tone = line.state === "broken" ? "danger" : "warning"
  const stores = [...new Map(line.attention.map((a) => [a.storeId, a.storeName])).entries()]
  const said = line.attention.map((a) => `${a.storeName}: ${SHORT[a.kind]}`)
  if (stores.length === 1) {
    const [storeId] = stores[0]!
    return {
      tone,
      label: said.length === 1 ? said[0]! : `${stores[0]![1]}: ${said.length} meldingen`,
      detail: `${said.join("; ")}. Bekijk wat Insyte al deed in Winkels.`,
      href: `/settings/stores?store=${storeId}`
    }
  }
  return {
    tone,
    label: `${stores.length} winkels vragen aandacht`,
    detail: `${said.join("; ")}. Bekijk wat Insyte al deed in Winkels.`,
    href: "/settings/stores"
  }
}

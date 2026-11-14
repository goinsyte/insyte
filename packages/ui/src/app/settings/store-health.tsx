import { useState } from "react"
import { AlertTriangle, ChevronDown } from "../../icons"
import { cn } from "../lib/utils"
import type { StoreHealth, StoreIncident } from "../shops/source"

/**
 * A store's incidents under its row on Winkels (sync health): what is wrong, what Insyte does about it or what the
 * operator can do, and what Insyte already tried, in order, each with its time. This is what the person on call needs
 * at night to decide whether to act, so it is written out, not tucked behind a hover. The ones resolved lately fold
 * under one line: they explain a gap in the figures, they ask nothing.
 */
export function StoreIncidents({ health, open: startOpen }: { health: StoreHealth; open: boolean }) {
  const live = health.incidents.filter((i) => i.resolved === null)
  const past = health.incidents.filter((i) => i.resolved !== null)
  const [showPast, setShowPast] = useState(startOpen && live.length === 0)
  if (health.incidents.length === 0) return null
  return (
    <li className="flex flex-col gap-2 px-3.5 pb-3 shadow-none! sm:pl-[58px]">
      {live.map((i) => <IncidentCard key={i.id} incident={i} />)}
      {past.length > 0 ?
        (
          <>
            <button
              type="button"
              onClick={() => setShowPast((v) => !v)}
              aria-expanded={showPast}
              className="flex w-fit items-center gap-1 rounded-md text-sm text-ink-3 transition-colors hover:text-ink-2"
            >
              <ChevronDown
                aria-hidden
                className={cn("size-3.5 transition-transform", showPast ? null : "-rotate-90")}
                strokeWidth={1.75}
              />
              {past.length === 1 ? "1 melding opgelost deze week" : `${past.length} meldingen opgelost deze week`}
            </button>
            {showPast ? past.map((i) => <IncidentCard key={i.id} incident={i} />) : null}
          </>
        ) :
        null}
    </li>
  )
}

function IncidentCard({ incident }: { incident: StoreIncident }) {
  const ended = incident.resolved !== null
  const meta = [ended ? incident.resolved : incident.since, incident.told].filter((m): m is string => m !== null)
  return (
    <div className={cn("rounded-lg px-3 py-2.5", ended ? "bg-mist/60" : "bg-mist")}>
      <p className="flex items-start gap-2 font-medium text-base text-ink">
        {ended ?
          <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-signal-green" /> :
          (
            <AlertTriangle
              aria-hidden
              className={cn(
                "mt-[3px] size-3.5 shrink-0",
                incident.tone === "danger" ? "text-signal-red" : "text-signal-amber"
              )}
              strokeWidth={2}
            />
          )}
        <span>{incident.finding}</span>
      </p>
      {incident.next !== null && !ended ? <p className="mt-0.5 pl-5.5 text-sm text-ink-2">{incident.next}</p> : null}
      {meta.length > 0 ? <p className="mt-0.5 pl-5.5 text-sm text-ink-3">{meta.join(" · ")}</p> : null}
      {incident.tried.length > 0 ?
        (
          <div className="mt-2 pl-5.5">
            <p className="font-medium text-sm text-ink-2">Wat Insyte al deed</p>
            <ol className="mt-1 flex flex-col gap-0.5">
              {incident.tried.map((t, n) => (
                // oxlint-disable-next-line react/no-array-index-key -- the steps only grow, in order
                <li key={n} className="flex gap-2.5 text-sm text-ink-2">
                  <span className="w-10 shrink-0 text-ink-3 tabular-nums">{t.at}</span>
                  <span className="min-w-0">{t.text}</span>
                </li>
              ))}
            </ol>
          </div>
        ) :
        null}
    </div>
  )
}

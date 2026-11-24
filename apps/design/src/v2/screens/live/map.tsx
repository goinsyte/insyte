import { useMemo, useRef, useState } from "react"
import type { KeyboardEvent } from "react"
import { SOURCE_SERVICE, STAGE_LABEL, STAGES } from "../../fixtures/live.ts"
import type { Stage, Visitor } from "../../fixtures/live.ts"
import { setQuery, useQuery } from "../../router.tsx"
import { cx } from "../../ui/cx.ts"
import { X } from "../../ui/icons.tsx"
import { ServiceLogo } from "../../ui/service-logo.tsx"
import { Segmented } from "../../ui/toggle.tsx"
import { GRIDS } from "./world.ts"
import type { MapView } from "./world.ts"

/*
 * Who is on the store, on the world: every visitor a dot, the land a field of fainter dots. The
 * further a visitor is in the funnel, the stronger the dot: light grey looking around, mid grey on a
 * product, ink with something in the cart, the accent while paying, and the good tone for the moment
 * after a sale. A dot whose stage just changed rings once (not for reduced motion). A dot opens its
 * visitor's card; so do the arrow keys and Enter, with the map focused. Drawn here in SVG from
 * `world.ts`: no map service, no request.
 */

/** The dot's colour per stage, as a class on an SVG shape. */
const FILL: Readonly<Record<Stage, string>> = {
  kijkt: "fill-series-3",
  product: "fill-series-2",
  mandje: "fill-ink",
  afrekenen: "fill-accent",
  gekocht: "fill-good"
}
const STROKE: Readonly<Record<Stage, string>> = {
  kijkt: "stroke-series-3",
  product: "stroke-series-2",
  mandje: "stroke-ink",
  afrekenen: "stroke-accent",
  gekocht: "stroke-good"
}
/** The same, as a background, for the legend and the card. */
const SWATCH: Readonly<Record<Stage, string>> = {
  kijkt: "bg-series-3",
  product: "bg-series-2",
  mandje: "bg-ink",
  afrekenen: "bg-accent",
  gekocht: "bg-good"
}

const VIEWS: ReadonlyArray<{ readonly value: MapView; readonly label: string; readonly query: string | null }> = [
  { value: "world", label: "Wereld", query: null },
  { value: "europe", label: "Europa", query: "europa" },
  { value: "america", label: "Noord-Amerika", query: "amerika" }
]

const pad = (n: number) => String(n).padStart(2, "0")

/** The demo clock at `seconds` after Live opened at `opened` ("14:30"). */
function clockAt(opened: { readonly hours: number; readonly minutes: number }, seconds: number) {
  const total = opened.hours * 3600 + opened.minutes * 60 + seconds
  return `${pad(Math.floor(total / 3600) % 24)}:${pad(Math.floor(total / 60) % 60)}`
}

export function LiveMap({ visitors, elapsed, turn, opened, boughtRecently }: {
  readonly visitors: ReadonlyArray<Visitor>
  /** Demo seconds since Live opened: how long a visitor has been on the store. */
  readonly elapsed: number
  /** The ticker's turn, so a dot that moved on this turn rings. */
  readonly turn: number
  readonly opened: { readonly hours: number; readonly minutes: number }
  /** Sales in the last ten minutes: the funnel's last step, which is not a dot any more. */
  readonly boughtRecently: number
}) {
  const asked = useQuery("kaart")
  const view: MapView = VIEWS.find((v) => v.query === asked)?.value ?? "world"
  const grid = GRIDS[view]
  const [open, setOpen] = useState<string | null>(null)
  const [cursor, setCursor] = useState(0)
  const frame = useRef<HTMLDivElement>(null)

  /* A dot keeps about the same size on screen whichever view's grid it sits on. */
  const size = 0.9 * Math.sqrt(GRIDS.world.cols / grid.cols) * (view === "europe" ? 1.6 : 1)
  const shown = useMemo(
    () =>
      visitors
        .map((v) => ({ v, at: grid.project(v.lon, v.lat) }))
        .filter(({ at }) => at.x >= 0 && at.y >= 0 && at.x <= grid.cols && at.y <= grid.rows),
    [visitors, grid]
  )
  const land = useMemo(
    () => grid.land.map(([c, r]) => <circle key={`${c}.${r}`} cx={c + 0.5} cy={r + 0.5} r={0.24} />),
    [grid]
  )
  const count = (stage: Stage) => visitors.filter((v) => v.stage === stage).length
  const focused = shown.find(({ v }) => v.id === open)
  const outside = visitors.length - shown.length

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (shown.length === 0) return
    const step = event.key === "ArrowRight" || event.key === "ArrowDown"
      ? 1
      : event.key === "ArrowLeft" || event.key === "ArrowUp"
      ? -1
      : 0
    if (step !== 0) {
      event.preventDefault()
      const next = (cursor + step + shown.length) % shown.length
      setCursor(next)
      setOpen(shown[next]?.v.id ?? null)
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      setOpen(shown[cursor % shown.length]?.v.id ?? null)
    } else if (event.key === "Escape" && open !== null) {
      event.stopPropagation()
      setOpen(null)
    }
  }

  return (
    <section aria-labelledby="kaart" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="kaart" className="text-sm font-semibold text-ink">Wie er nu is</h2>
        <Segmented
          size="sm"
          label="Kaart"
          value={view}
          options={VIEWS.map(({ value, label }) => ({ value, label }))}
          onChange={(next) => {
            setOpen(null)
            setCursor(0)
            setQuery({ kaart: VIEWS.find((v) => v.value === next)?.query ?? null })
          }}
        />
      </div>

      <div
        ref={frame}
        role="group"
        tabIndex={0}
        aria-label={`Kaart met ${visitors.length} bezoekers. Pijltjes kiezen een bezoeker, Enter toont wie het is.`}
        onKeyDown={onKeyDown}
        className="relative rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <svg
          key={view}
          viewBox={`0 0 ${grid.cols} ${grid.rows}`}
          className="block h-auto max-h-[420px] w-full animate-rise motion-reduce:animate-none"
          style={{ aspectRatio: `${grid.cols} / ${grid.rows}` }}
          aria-hidden="true"
        >
          <g className="fill-line-strong">{land}</g>
          {shown.map(({ v, at }) => {
            const fresh = v.moved === turn
            const here = v.id === open
            return (
              <g
                key={v.id}
                className="cursor-pointer"
                onClick={(event) => {
                  event.stopPropagation()
                  setOpen(here ? null : v.id)
                  setCursor(shown.findIndex((s) => s.v.id === v.id))
                }}
              >
                <title>{`${v.city} · ${STAGE_LABEL[v.stage]}`}</title>
                {fresh && (
                  <circle
                    cx={at.x}
                    cy={at.y}
                    r={size}
                    strokeWidth={size * 0.16}
                    className={cx(
                      "animate-ping fill-none [transform-box:fill-box] [transform-origin:center] motion-reduce:hidden",
                      STROKE[v.stage]
                    )}
                  />
                )}
                {here && (
                  <circle
                    cx={at.x}
                    cy={at.y}
                    r={size * 1.25}
                    strokeWidth={size * 0.14}
                    className="fill-none stroke-ink"
                  />
                )}
                <circle cx={at.x} cy={at.y} r={size * 0.55} className={FILL[v.stage]} />
                {/* A larger target than the dot, so a finger finds it. */}
                <circle cx={at.x} cy={at.y} r={size * 1.6} className="fill-transparent" />
              </g>
            )
          })}
        </svg>
        {focused !== undefined && (
          <VisitorCard
            visitor={focused.v}
            left={(focused.at.x / grid.cols) * 100}
            top={(focused.at.y / grid.rows) * 100}
            minutes={Math.max(0, Math.round((elapsed - focused.v.since) / 60))}
            arrived={clockAt(opened, focused.v.since)}
            onClose={() => {
              setOpen(null)
              frame.current?.focus()
            }}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-ink-2">
        {STAGES.map((stage) => (
          <span key={stage} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={cx("size-2 rounded-full", SWATCH[stage])} />
            {STAGE_LABEL[stage]}
            <span className="figure text-ink-3">{count(stage)}</span>
          </span>
        ))}
        <span className="text-ink-3 sm:ml-auto">
          <span className="figure">{visitors.length}</span> nu
          {outside > 0 && (
            <>
              , <span className="figure">{outside}</span> buiten deze kaart
            </>
          )} · <span className="figure">{boughtRecently}</span> gekocht in de laatste 10 min
        </span>
      </div>
    </section>
  )
}

/** Who one dot is: where, how far, what they look at and hold, how they came and since when. */
function VisitorCard({ visitor, left, top, minutes, arrived, onClose }: {
  readonly visitor: Visitor
  /** Where the dot is, in percent of the map. */
  readonly left: number
  readonly top: number
  readonly minutes: number
  readonly arrived: string
  readonly onClose: () => void
}) {
  const service = SOURCE_SERVICE[visitor.source]
  const below = top < 55
  return (
    <div
      role="dialog"
      aria-label={`Bezoeker uit ${visitor.city}`}
      className="absolute z-10 w-64 animate-rise rounded-md bg-canvas p-3.5 shadow-pop ring-1 ring-line motion-reduce:animate-none"
      style={{
        left: `clamp(0.5rem, calc(${left}% - 8rem), calc(100% - 16.5rem))`,
        ...(below ? { top: `calc(${top}% + 1rem)` } : { bottom: `calc(${100 - top}% + 1rem)` })
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="truncate text-sm font-semibold text-ink">
            {visitor.city}
            <span className="font-normal text-ink-3">, {visitor.country}</span>
          </p>
          <p className="flex items-center gap-1.5 text-xs text-ink-2">
            <span aria-hidden="true" className={cx("size-2 rounded-full", SWATCH[visitor.stage])} />
            {STAGE_LABEL[visitor.stage]}
          </p>
        </div>
        <button
          type="button"
          aria-label="Sluiten"
          onClick={onClose}
          className="-mt-1 -mr-1.5 inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-ink-3 hover:bg-hover hover:text-ink"
        >
          <X size={15} />
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-ink-3">{visitor.stage === "kijkt" ? "Op" : "Bekijkt"}</dt>
        <dd className="truncate text-ink">{visitor.page}</dd>
        {visitor.cart !== undefined && (
          <>
            <dt className="text-ink-3">{visitor.stage === "gekocht" ? "Kocht" : "In het mandje"}</dt>
            <dd className="text-pretty text-ink">{visitor.cart}</dd>
          </>
        )}
        <dt className="text-ink-3">Via</dt>
        <dd className="flex items-center gap-1.5 text-ink">
          {service !== null && <ServiceLogo service={service} size={14} bare />}
          {visitor.source}
        </dd>
        <dt className="text-ink-3">Apparaat</dt>
        <dd className="text-ink">
          {visitor.device}
          {visitor.returning && <span className="text-ink-3">{" "}· eerder geweest</span>}
        </dd>
        <dt className="text-ink-3">Op de winkel</dt>
        <dd className="text-ink">
          <span className="figure">{minutes}</span> min <span className="text-ink-3">· sinds</span>{" "}
          <span className="figure">{arrived}</span>
        </dd>
      </dl>
    </div>
  )
}

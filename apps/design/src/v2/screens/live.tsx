import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { BlockView } from "../charts/block-view.tsx"
import { FigureStrip } from "../charts/figure-strip.tsx"
import { formatValue } from "../charts/format.ts"
import { Funnel } from "../charts/funnel.tsx"
import type { Figure } from "../charts/types.ts"
import {
  COMING_FROM,
  EVENTS,
  INCOMING,
  LANDING_PAGES,
  LIVE_KEY,
  LOOKING_AT,
  NOW,
  OPENED_AT,
  pickWeighted,
  place,
  PLACES,
  SAME_TIME,
  VISITORS,
  VISITORS_TODAY,
  visitorTraits,
  WHERE_THEY_ARE
} from "../fixtures/live.ts"
import type { LiveEvent, Stage, Visitor } from "../fixtures/live.ts"
import { navigate, paths, setQuery, useQuery } from "../router.tsx"
import { Button } from "../ui/button.tsx"
import { cx } from "../ui/cx.ts"
import { Bot, MessageSquare, Pause, Play, Radio, ShoppingBag, Wallet } from "../ui/icons.tsx"
import { Rich } from "../ui/rich.tsx"
import { Skeleton } from "../ui/skeleton.tsx"
import { EmptyState, ErrorState } from "../ui/states.tsx"
import { Segmented } from "../ui/toggle.tsx"
import { dataState, setView, useView } from "../view.ts"
import { LiveMap } from "./live/map.tsx"

/** "Vraag door" on a Live block opens a chat with that block as context. */
const ask = (title: string) => navigate(paths.newChat(`Live · ${title}`))

/** One event every few real seconds; the demo clock moves on by the event's own gap. */
const TICK_MS = 5000
const FEED_LENGTH = 24
/** A screen reader hears a sale at most once a minute, and nothing else: the feed is not a ticker for the ear. */
const ANNOUNCE_MS = 60_000

/**
 * Live: what is happening on the store, as a stream. The feed is the page: a full-height timeline,
 * newest on top, with today's figures ticking in one thin line at its head. The charts are the
 * context, small in a narrow column beside it, so Live reads as the present tense of the business and
 * not as a second Analyse board. It ticks every few seconds; the head says when it last did, it can be
 * paused (WCAG 2.2.2), and the ticking stops for people who asked for reduced motion.
 */
export function LiveScreen() {
  const state = dataState(useView())
  if (state === "loading") return <LiveLoading />
  if (state === "error") return <LiveOffline />
  if (state === "empty") return <LiveEmpty />
  return <LiveNow />
}

function LiveNow() {
  const [paused, setPaused] = useState(false)
  const { crowd, events, clock, announcement, still, elapsed, turn, sales } = useTicker(paused)
  const visitors = tallyStages(crowd, sales)

  const figures: ReadonlyArray<Figure> = [
    { label: "Op de winkel", value: visitors.onStore, previous: SAME_TIME.onStore, format: "count", better: "higher" },
    { label: "In een mandje", value: visitors.inCart, previous: SAME_TIME.inCart, format: "count", better: "higher" },
    {
      label: "Omzet vandaag",
      value: visitors.salesToday,
      previous: SAME_TIME.salesToday,
      format: "euro",
      better: "higher"
    },
    {
      label: "Bestellingen vandaag",
      value: visitors.ordersToday,
      previous: SAME_TIME.ordersToday,
      format: "count",
      better: "higher"
    }
  ]

  return (
    <div className="pane-scroll flex-1">
      <div className="mx-auto grid w-full max-w-[1240px] gap-x-14 gap-y-12 px-4 py-6 sm:px-8 sm:py-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <section aria-labelledby="live" className="flex min-w-0 flex-col gap-7">
          <header className="flex flex-col gap-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h1 id="live" className="text-xl font-semibold text-ink">Live</h1>
              <div className="flex items-center gap-2 text-xs text-ink-3">
                <span className="relative flex size-2" aria-hidden="true">
                  {!paused && (
                    <span className="absolute inset-0 animate-ping rounded-full bg-good opacity-60 motion-reduce:hidden" />
                  )}
                  <span className={cx("relative size-2 rounded-full", paused ? "bg-ink-3" : "bg-good")} />
                </span>
                <p>
                  Northwind EU · {paused ? "gepauzeerd om" : "bijgewerkt om"}{" "}
                  <span className="figure text-ink-2">{clock}</span>
                </p>
                {!still && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={paused ? <Play /> : <Pause />}
                    aria-pressed={paused}
                    onClick={() => setPaused((p) => !p)}
                  >
                    {paused ? "Hervatten" : "Pauzeren"}
                  </Button>
                )}
              </div>
            </div>
            <FigureStrip
              figures={figures}
              label="Nu op de winkel"
              compareLabel={`vorige maandag om ${pad(OPENED_AT.hours)}:${pad(OPENED_AT.minutes)}`}
            />
          </header>
          <LiveMap
            visitors={crowd}
            elapsed={elapsed}
            turn={turn}
            opened={OPENED_AT}
            boughtRecently={recentSales(events, elapsed)}
          />
          <Feed events={events} />
          <p role="status" className="sr-only">{announcement}</p>
        </section>

        <aside
          aria-label="Achtergrond"
          className="flex min-w-0 flex-col gap-10 lg:pt-1 xl:sticky xl:overflow-y-auto xl:overscroll-contain xl:[scrollbar-width:thin] xl:top-0 xl:-my-8 xl:max-h-[calc(100dvh-var(--bar-height))] xl:self-start xl:py-8 xl:pr-1"
        >
          <BlockView
            block={VISITORS_TODAY}
            size="compact"
            compareLabel="was"
            keyLabels={LIVE_KEY}
            onAsk={ask}
          />
          <article aria-labelledby="blok-trechter-nu" className="flex flex-col gap-4">
            <h2 id="blok-trechter-nu" className="text-sm font-semibold text-ink">Hoe ver komen ze nu?</h2>
            <Funnel
              data={{
                steps: [
                  { label: "Op de winkel", value: visitors.onStore },
                  { label: "Bekijkt een product", value: visitors.browsing },
                  { label: "Iets in het mandje", value: visitors.inCart },
                  { label: "Rekent af", value: visitors.checkout }
                ]
              }}
            />
            <p className="text-2xs text-ink-3">Shopify · sessies van de laatste 5 minuten</p>
          </article>
          <BlockView
            block={lookingAt(crowd)}
            size="compact"
            compareLabel="was"
            keyLabels={LIVE_KEY}
            onAsk={ask}
          />
          <BlockView
            block={whereTheyAre(crowd)}
            size="compact"
            compareLabel="was"
            keyLabels={LIVE_KEY}
            onAsk={ask}
          />
          <BlockView block={COMING_FROM} size="compact" compareLabel="was" keyLabels={LIVE_KEY} onAsk={ask} />
        </aside>
      </div>
    </div>
  )
}

const EVENT_GLYPH = { sale: Wallet, cart: ShoppingBag, chat: MessageSquare, agent: Bot } as const
const EVENT_WORD = { sale: "Verkoop", cart: "Mandje", chat: "Chat", agent: "Agent" } as const

/**
 * "Wat er gebeurt": the store as sentences, newest on top, one line each with its minute. A sale is
 * the event the screen exists for: its glyph is the good tone and its sentence is in ink; the rest
 * step back to the second ink. No rules between lines: the time column holds the rhythm.
 */
function Feed({ events }: { readonly events: ReadonlyArray<LiveEvent> }) {
  const money = useQuery("toon") === "kopen"
  const shown = money ? events.filter((e) => e.kind === "sale" || e.kind === "cart") : events
  return (
    <section aria-labelledby="gebeurt" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id="gebeurt" className="text-sm font-semibold text-ink">Wat er gebeurt</h2>
        <Segmented
          size="sm"
          label="Wat de stroom toont"
          value={money ? "kopen" : "alles"}
          options={[{ value: "alles", label: "Alles" }, { value: "kopen", label: "Mandje en kopen" }]}
          onChange={(next) => setQuery({ toon: next === "kopen" ? next : null })}
        />
      </div>
      <ol className="flex flex-col">
        {shown.map((event, i) => {
          const G = EVENT_GLYPH[event.kind]
          const sale = event.kind === "sale"
          return (
            <li
              key={event.id}
              className={cx(
                "grid grid-cols-[2.75rem_1.25rem_minmax(0,1fr)] items-start gap-x-2 py-2 text-sm",
                sale ? "text-ink" : "text-ink-2",
                i === 0 && "animate-rise"
              )}
            >
              <span className="figure pt-px text-xs text-ink-3">{event.at}</span>
              <G
                size={15}
                className={cx("mt-0.5", sale ? "text-good-ink" : "text-ink-3")}
                aria-label={EVENT_WORD[event.kind]}
              />
              <span className="min-w-0 text-pretty">
                <Rich text={event.text} />
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

type Visitors = {
  readonly onStore: number
  readonly browsing: number
  readonly inCart: number
  readonly checkout: number
  readonly salesToday: number
  readonly ordersToday: number
}

const FURTHER: Readonly<Record<Stage, number>> = { kijkt: 0, product: 1, mandje: 2, afrekenen: 3, gekocht: 4 }

/** The figures and the funnel, counted from the dots: the map and the numbers cannot disagree. */
function tallyStages(crowd: ReadonlyArray<Visitor>, sales: { readonly revenue: number; readonly orders: number }) {
  const atLeast = (stage: Stage) =>
    crowd.filter((v) => v.stage !== "gekocht" && FURTHER[v.stage] >= FURTHER[stage]).length
  return {
    onStore: crowd.filter((v) => v.stage !== "gekocht").length,
    browsing: atLeast("product"),
    inCart: atLeast("mandje"),
    checkout: atLeast("afrekenen"),
    salesToday: sales.revenue,
    ordersToday: sales.orders
  } satisfies Visitors
}

/** "Waar kijken ze nu naar?", counted from who is on a product page now. */
function lookingAt(crowd: ReadonlyArray<Visitor>): typeof LOOKING_AT {
  const items = tally(crowd.filter((v) => v.stage !== "kijkt" && v.stage !== "gekocht"), (v) => v.page).slice(0, 5)
  // The note is about the Aurora; it stays while the Aurora is the one most looked at.
  const { note, ...rest } = LOOKING_AT
  return {
    ...(items[0]?.label === "Aurora Hooded Fleece" && note !== undefined ? { note } : {}),
    ...rest,
    data: { ...LOOKING_AT.data, items, focus: 0 }
  }
}

/** "Waar zijn ze?", counted from the dots: the four biggest countries, and the rest as Overig. */
function whereTheyAre(crowd: ReadonlyArray<Visitor>): typeof WHERE_THEY_ARE {
  const all = tally(crowd.filter((v) => v.stage !== "gekocht"), (v) => v.country)
  const rest = all.slice(4).reduce((sum, item) => sum + item.value, 0)
  const items = rest > 0 ? [...all.slice(0, 4), { label: "Overig", value: rest }] : all.slice(0, 4)
  return { ...WHERE_THEY_ARE, data: { ...WHERE_THEY_ARE.data, items } }
}

function tally(crowd: ReadonlyArray<Visitor>, key: (v: Visitor) => string) {
  const counts = new Map<string, number>()
  for (const v of crowd) counts.set(key(v), (counts.get(key(v)) ?? 0) + 1)
  return [...counts].map(([label, value]) => ({ label, value })).toSorted((a, b) => b.value - a.value)
}

/** Sales in the ten demo minutes before now. */
function recentSales(events: ReadonlyArray<LiveEvent>, elapsed: number) {
  const now = OPENED_AT.hours * 60 + OPENED_AT.minutes + Math.floor(elapsed / 60)
  return events.filter((e) => {
    if (e.kind !== "sale") return false
    const [h, m] = e.at.split(":").map(Number)
    return now - ((h ?? 0) * 60 + (m ?? 0)) < 10
  }).length
}

const pad = (n: number) => String(n).padStart(2, "0")

/** The demo clock: the fixture's opening time plus the demo seconds that have passed. */
function demoTime(seconds: number) {
  const total = OPENED_AT.hours * 3600 + OPENED_AT.minutes * 60 + seconds
  const h = Math.floor(total / 3600) % 24
  const m = Math.floor(total / 60) % 60
  return `${pad(h)}:${pad(m)}`
}

/** A dot moved to a city's centre: where a cart or a sale in the script happened. */
function moveTo(city: string) {
  const at = place(city)
  return at === undefined ? {} : { city, country: at.country, lon: at.lon, lat: at.lat }
}

/** How many stay on the store, give or take: the crowd drifts around the 47 it opened with. */
const BASE = VISITORS.length
let arrivals = 0

/**
 * One turn of the crowd. A sale or a cart in the script happens to a dot in its city (moved there
 * if nobody from that city is far enough in); around it the crowd drifts: someone arrives, someone
 * leaves, one looks at a product, one gives up on a cart. A dot that just bought stays one turn and
 * then goes. Every dot whose stage changed carries this turn, so the map rings it.
 */
function stepCrowd(
  crowd: ReadonlyArray<Visitor>,
  next: (typeof INCOMING)[number],
  turn: number,
  seconds: number
): ReadonlyArray<Visitor> {
  const roll = Math.random
  let list = crowd.filter((v) => !(v.stage === "gekocht" && v.moved < turn - 1))
  const change = (id: string | undefined, fields: Partial<Visitor>) => {
    if (id === undefined) return
    list = list.map((v) => (v.id === id ? { ...v, ...fields, moved: turn } : v))
  }
  const anyAt = (stages: ReadonlyArray<Stage>, city?: string) => {
    const pool = list.filter((v) => stages.includes(v.stage))
    return (pool.find((v) => v.city === city) ?? pool[Math.floor(roll() * pool.length)])?.id
  }

  if (next.who !== undefined) {
    const { place: city, product, size } = next.who
    if (next.kind === "cart") {
      change(anyAt(["product", "kijkt"], city), {
        ...moveTo(city),
        stage: "mandje",
        page: product,
        cart: `${product}, maat ${size}`
      })
    } else if (next.kind === "sale") {
      change(anyAt(["afrekenen"], city) ?? anyAt(["mandje"], city), {
        ...moveTo(city),
        stage: "gekocht",
        page: product,
        cart: `${product}, maat ${size}`
      })
      // The next in line starts paying, so the funnel's last step does not run dry.
      change(anyAt(["mandje"]), { stage: "afrekenen" })
    }
  }

  // The drift: one arrives or one leaves, by how far the crowd is from its base.
  const onStore = list.filter((v) => v.stage !== "gekocht").length
  if (roll() < 0.5 + (BASE - onStore) * 0.08) {
    const where = pickWeighted(PLACES, (p) => p.weight, roll())
    const traits = visitorTraits(roll)
    arrivals += 1
    list = [...list, {
      id: `n${arrivals}`,
      city: where.city,
      country: where.country,
      lon: where.lon + traits.jitter[0],
      lat: where.lat + traits.jitter[1],
      stage: "kijkt",
      page: LANDING_PAGES[Math.floor(roll() * LANDING_PAGES.length)] ?? "Homepagina",
      source: traits.source,
      device: traits.device,
      returning: traits.returning,
      since: seconds,
      moved: turn
    }]
  } else {
    const leaving = anyAt(["kijkt", "product"])
    list = list.filter((v) => v.id !== leaving)
  }
  const looking = anyAt(["kijkt"])
  const viewed = LOOKING_AT.data.items[Math.floor(roll() * LOOKING_AT.data.items.length)]?.label
  if (viewed !== undefined) change(looking, { stage: "product", page: viewed })
  if (roll() < 0.3) change(anyAt(["mandje"]), { stage: "product", cart: undefined })
  return list
}

/**
 * The demo's heartbeat: an event from the script arrives with its own gap, so the times in the feed
 * move on, and the crowd on the map takes a turn with it. Revenue and orders grow only by the sales
 * that arrive. Screen readers get the sales only, at most once a minute, through one status line.
 */
function useTicker(paused: boolean) {
  const [crowd, setCrowd] = useState<ReadonlyArray<Visitor>>(VISITORS)
  const [sales, setSales] = useState<{ readonly revenue: number; readonly orders: number }>({
    revenue: NOW.salesToday,
    orders: NOW.ordersToday
  })
  const [events, setEvents] = useState<ReadonlyArray<LiveEvent>>(EVENTS)
  const [clock, setClock] = useState(() => demoTime(0))
  const [elapsed, setElapsed] = useState(0)
  const [turn, setTurn] = useState(0)
  const [announcement, setAnnouncement] = useState("")
  const lastSpoken = useRef(0)
  const turns = useRef(0)
  const seconds = useRef(0)
  const [still] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches)

  useEffect(() => {
    if (still || paused) return
    const id = window.setInterval(() => {
      const next = INCOMING[turns.current % INCOMING.length]
      turns.current += 1
      if (next === undefined) return
      seconds.current += next.after
      const at = demoTime(seconds.current)
      const now = turns.current
      setClock(at)
      setElapsed(seconds.current)
      setTurn(now)
      setCrowd((list) => stepCrowd(list, next, now, seconds.current))
      if (next.kind === "sale") {
        setSales((s) => ({ revenue: s.revenue + (next.amount ?? 0), orders: s.orders + 1 }))
      }
      setEvents((list) => [{ ...next, id: `live-${now}`, at }, ...list].slice(0, FEED_LENGTH))
      if (next.kind === "sale" && Date.now() - lastSpoken.current >= ANNOUNCE_MS) {
        lastSpoken.current = Date.now()
        setAnnouncement(`Verkoop om ${at}: ${formatValue(next.amount ?? 0, "euro")}`)
      }
    }, TICK_MS)
    return () => {
      window.clearInterval(id)
    }
  }, [still, paused])

  return { crowd, sales, events, clock, elapsed, turn, announcement, still }
}

/* ── the states ─────────────────────────────────────────────────────────────────────────────────── */

function LiveFrame({ status, children }: { readonly status: string; readonly children: ReactNode }) {
  return (
    <div className="pane-scroll flex-1">
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-7 px-4 py-6 sm:px-8 sm:py-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h1 className="text-xl font-semibold text-ink">Live</h1>
          <p className="text-xs text-ink-3">Northwind EU · {status}</p>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Connecting: the strip's four figures and the feed's lines in their own shapes. */
function LiveLoading() {
  return (
    <LiveFrame status="verbinden">
      <div
        aria-busy="true"
        aria-label="Live verbinden"
        className="grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_19rem]"
      >
        <div className="flex flex-col gap-7">
          <div className="flex flex-wrap gap-8">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="flex flex-col gap-2">
                <Skeleton className="h-2.5 w-20" />
                <Skeleton className="h-7 w-16" />
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-3.5">
            <Skeleton className="h-3.5 w-28" />
            {Array.from(
              { length: 8 },
              (_, i) => (
                <span key={i} className="grid grid-cols-[2.75rem_1.25rem_minmax(0,1fr)] gap-x-2">
                  <Skeleton className="h-3 w-9" />
                  <Skeleton className="size-3.5 rounded-full" />
                  <Skeleton className="h-3" style={{ width: `${50 + ((i * 17) % 40)}%` }} />
                </span>
              )
            )}
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-36 w-full rounded-md" />
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-28 w-full rounded-md" />
        </div>
      </div>
    </LiveFrame>
  )
}

function LiveOffline() {
  return (
    <LiveFrame status="geen verbinding">
      <ErrorState
        title="Geen verbinding met je winkel"
        detail="wss://live.insyte.app/northwind-eu · 1006 · na 3 pogingen"
        action={<Button onClick={() => setView({ staat: "gewoon" })}>Opnieuw verbinden</Button>}
      >
        Live kreeg drie keer geen antwoord van Shopify. Bestellingen komen gewoon binnen; alleen de stroom hier staat
        stil tot de verbinding terug is.
      </ErrorState>
    </LiveFrame>
  )
}

function LiveEmpty() {
  return (
    <LiveFrame status="wacht op de eerste bezoeker">
      <EmptyState
        glyph={Radio}
        title="Nog niemand op je winkel"
        action={<Button onClick={() => navigate(paths.settings("winkels"))}>Live-pixel controleren</Button>}
      >
        Live laat zien wie er nu op je winkel is, waar ze vandaan komen en wie er afrekent. Het begint zodra de
        Live-pixel op je winkel staat en de eerste bezoeker binnenkomt.
      </EmptyState>
    </LiveFrame>
  )
}

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
  LIVE_KEY,
  LOOKING_AT,
  NOW,
  OPENED_AT,
  SAME_TIME,
  VISITORS_TODAY,
  WHERE_THEY_ARE
} from "../fixtures/live.ts"
import type { LiveEvent } from "../fixtures/live.ts"
import { navigate, paths, setQuery, useQuery } from "../router.tsx"
import { Button } from "../ui/button.tsx"
import { cx } from "../ui/cx.ts"
import { Bot, MessageSquare, Pause, Play, Radio, ShoppingBag, Wallet } from "../ui/icons.tsx"
import { Rich } from "../ui/rich.tsx"
import { Skeleton } from "../ui/skeleton.tsx"
import { EmptyState, ErrorState } from "../ui/states.tsx"
import { Segmented } from "../ui/toggle.tsx"
import { dataState, setView, useView } from "../view.ts"

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
  const { visitors, events, clock, announcement, still } = useTicker(paused)

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
          <BlockView block={LOOKING_AT} size="compact" compareLabel="was" keyLabels={LIVE_KEY} onAsk={ask} />
          <BlockView block={WHERE_THEY_ARE} size="compact" compareLabel="was" keyLabels={LIVE_KEY} onAsk={ask} />
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

const drift = (value: number, spread: number, min: number) =>
  Math.max(min, value + Math.round((Math.random() - 0.5) * 2 * spread))

const pad = (n: number) => String(n).padStart(2, "0")

/** The demo clock: the fixture's opening time plus the demo seconds that have passed. */
function demoTime(seconds: number) {
  const total = OPENED_AT.hours * 3600 + OPENED_AT.minutes * 60 + seconds
  const h = Math.floor(total / 3600) % 24
  const m = Math.floor(total / 60) % 60
  return `${pad(h)}:${pad(m)}`
}

/**
 * The demo's heartbeat: visitors drift around the base, and an event from the script arrives with its
 * own gap, so the times in the feed move on. Revenue and orders grow only by the sales that arrive.
 * Screen readers get the sales only, at most once a minute, through one status line.
 */
function useTicker(paused: boolean) {
  const [visitors, setVisitors] = useState<Visitors>(NOW)
  const [events, setEvents] = useState<ReadonlyArray<LiveEvent>>(EVENTS)
  const [clock, setClock] = useState(() => demoTime(0))
  const [announcement, setAnnouncement] = useState("")
  const lastSpoken = useRef(0)
  const turn = useRef(0)
  const seconds = useRef(0)
  const [still] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches)

  useEffect(() => {
    if (still || paused) return
    const id = window.setInterval(() => {
      const next = INCOMING[turn.current % INCOMING.length]
      turn.current += 1
      if (next === undefined) return
      seconds.current += next.after
      const at = demoTime(seconds.current)
      setClock(at)
      setVisitors((v) => {
        const onStore = drift(v.onStore, 3, 30)
        const browsing = Math.min(onStore - 2, drift(v.browsing, 2, 18))
        const inCart = Math.min(browsing - 4, drift(v.inCart, 1, 5))
        const checkout = Math.min(inCart - 1, drift(v.checkout, 1, 1))
        return {
          onStore,
          browsing,
          inCart,
          checkout,
          salesToday: v.salesToday + (next.amount ?? 0),
          ordersToday: v.ordersToday + (next.kind === "sale" ? 1 : 0)
        }
      })
      setEvents((list) => [{ ...next, id: `live-${turn.current}`, at }, ...list].slice(0, FEED_LENGTH))
      if (next.kind === "sale" && Date.now() - lastSpoken.current >= ANNOUNCE_MS) {
        lastSpoken.current = Date.now()
        setAnnouncement(`Verkoop om ${at}: ${formatValue(next.amount ?? 0, "euro")}`)
      }
    }, TICK_MS)
    return () => {
      window.clearInterval(id)
    }
  }, [still, paused])

  return { visitors, events, clock, announcement, still }
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

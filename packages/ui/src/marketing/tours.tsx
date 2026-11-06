import { motion, useInView, useReducedMotion } from "motion/react"
import { type ReactNode, useEffect, useId, useRef, useState } from "react"
import { cn } from "../lib/utils.ts"
import { Frame } from "./frame.tsx"
import { useMarketingLinks } from "./links.tsx"
import { ArrowLink } from "./parts.tsx"
import { BuilderScreen, TicketsScreen } from "./tour-screens.tsx"

/*
 * The product tours: two real screens, each the wide side of a two-column section, with the claim
 * and three steps beside it (Calendly's expanding steps). The open step drives what the window
 * shows; it moves on by itself while the tour is on screen and nobody is pointing at it, with a
 * line that measures its time. The window bleeds a little past the frame on the outside, and the
 * sides alternate.
 */

const DWELL = 5600

type Point = { readonly title: string; readonly body: string }

function Tour(
  { id, title, body, points, href, cta, screen, flip, ground }: {
    readonly id: string
    readonly title: string
    readonly body: string
    readonly points: readonly [Point, Point, Point]
    readonly href: string
    readonly cta: string
    readonly screen: (step: number, run: boolean) => ReactNode
    readonly flip: boolean
    readonly ground: "paper" | "glacier"
  }
) {
  const ref = useRef<HTMLDivElement | null>(null)
  const reduced = useReducedMotion() === true
  const inView = useInView(ref, { amount: 0.4 })
  const [step, setStep] = useState(0)
  const [held, setHeld] = useState(false)
  const base = useId()
  const auto = !reduced && inView && !held

  useEffect(() => {
    if (!auto) return
    const t = window.setTimeout(() => setStep((s) => (s + 1) % points.length), DWELL)
    return () => window.clearTimeout(t)
  }, [auto, step, points.length])

  const heading = `${id}-kop`
  return (
    <section
      id={id}
      aria-labelledby={heading}
      className={cn("overflow-x-clip", ground === "paper" ? "bg-paper" : "bg-glacier")}
    >
      <Frame
        inner={cn(
          "grid items-center gap-12 py-20 sm:py-28 lg:gap-14",
          flip ? "lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]" : "lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
        )}
      >
        <div ref={ref} className={cn("flex flex-col gap-6", flip && "lg:order-2")}>
          <h2 id={heading} className="font-medium text-4xl text-ink sm:text-display-sm">
            {title}
          </h2>
          <p className="max-w-[46ch] text-ink-2 text-lg">{body}</p>
          <ol className="flex flex-col" onPointerLeave={() => setHeld(false)}>
            {points.map((p, i) => {
              const open = i === step
              return (
                <li key={p.title} className="relative pl-5">
                  <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-ink/10" />
                  {open
                    ? (
                      <motion.span
                        aria-hidden
                        key={`${step}-${auto}`}
                        className="absolute inset-y-0 left-0 w-0.5 origin-top bg-arc"
                        initial={{ scaleY: auto ? 0 : 1 }}
                        animate={{ scaleY: 1 }}
                        transition={{ duration: auto ? DWELL / 1000 : 0, ease: "linear" }}
                      />
                    )
                    : null}
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={`${base}-${i}`}
                    onPointerEnter={() => {
                      setHeld(true)
                      setStep(i)
                    }}
                    onFocus={() => {
                      setHeld(true)
                      setStep(i)
                    }}
                    onClick={() => {
                      setHeld(true)
                      setStep(i)
                    }}
                    className={cn(
                      "w-full py-3 text-left font-medium text-md transition-colors",
                      open ? "text-ink" : "text-ink-3 hover:text-ink-2"
                    )}
                  >
                    {p.title}
                  </button>
                  <div
                    id={`${base}-${i}`}
                    className={cn(
                      "grid transition-[grid-template-rows,opacity] duration-500 ease-[var(--ease-out-expo)]",
                      open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    )}
                  >
                    <p className="min-h-0 overflow-hidden pb-1 text-base text-ink-2">
                      <span className="block max-w-[44ch] pb-3">{p.body}</span>
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>
          <ArrowLink href={href} external className="w-fit">{cta}</ArrowLink>
        </div>
        <div
          className={cn(
            "w-full overflow-hidden rounded-lg window-lift",
            flip ? "lg:order-1 xl:-ml-12 xl:w-[calc(100%+3rem)]" : "xl:-mr-12 xl:w-[calc(100%+3rem)]"
          )}
        >
          {screen(step, !reduced && inView)}
        </div>
      </Frame>
    </section>
  )
}

export function Tours() {
  const links = useMarketingLinks()
  return (
    <>
      <Tour
        id="tickets"
        ground="paper"
        flip={false}
        title="Het antwoord staat al klaar."
        body="Gmail en je winkel lopen Insyte in. Insyte leest de klant, de bestelling en de eerdere tickets, en zet er een concept in jouw toon onder."
        points={[
          {
            title: "Het bericht komt binnen",
            body: "Uit Gmail, Shopify of een geschil bij Klarna, in één inbox, met de klant en zijn bestelling erbij."
          },
          {
            title: "Insyte leest de bestelling",
            body:
              "De pakbon, de scan van de vervoerder en eerdere tickets: Insyte ziet wat er in de doos zat en wat niet."
          },
          {
            title: "Het concept staat klaar",
            body: "In jouw toon, met de bron van elk feit. Versturen, aanpassen of negeren: jij kiest."
          }
        ]}
        href={links.inApp("/tickets")}
        cta="Tickets bekijken"
        screen={(step, run) => <TicketsScreen step={step} run={run} />}
      />
      <Tour
        id="automatiseringen"
        ground="glacier"
        flip
        title="Automatiseringen in gewoon Nederlands."
        body="Beschrijf wat er moet gebeuren, en Insyte zet de stappen neer met de diensten die je al gebruikt. Een automatisering gaat pas aan als jij publiceert."
        points={[
          {
            title: "Beschrijf wat er moet gebeuren",
            body: "Eén zin is genoeg: wanneer het begint, wie iets moet weten en wat de klant krijgt."
          },
          {
            title: "Insyte zet de stappen neer",
            body: "Een trigger uit Shopify, de leverancier, een AI-stap voor de excuses, Gmail en Slack voor de rest."
          },
          {
            title: "Test met een echte bestelling",
            body:
              "Elke stap draait op een echte bestelling, zonder dat er iets wordt verstuurd. Elke gepubliceerde versie blijft bewaard."
          }
        ]}
        href={links.inApp("/automations")}
        cta="Automatiseringen bekijken"
        screen={(step, run) => <BuilderScreen step={step} run={run} />}
      />
    </>
  )
}

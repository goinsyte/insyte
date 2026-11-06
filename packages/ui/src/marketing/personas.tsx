import type { ReactNode } from "react"
import { ArrowRight, Check } from "../icons.tsx"
import { cn } from "../lib/utils.ts"
import { useMarketingLinks } from "./links.tsx"
import { usePlay } from "./parts.tsx"
import { OperatorWindow, PartnerWindow, SupplierWindow } from "./personas-screens.tsx"

/*
 * The three portals, as one row of three equal cards that together span the hero wrapper's width:
 * the operator's console on abyss with the drafting grid, the supplier's portal on mist and the
 * partner's dashboard on paper. Each card reads top down — who it is for, two lines, three points
 * and the way in — and the real portal window fills its foot, bleeding off the right and bottom
 * edges. As the row comes into view the windows rise and settle, one after the other. The server,
 * reduced motion and a row already on screen show them settled. At `md` two and one; on a phone
 * they stack.
 */

type Persona = {
  readonly id: "operators" | "leveranciers" | "partners"
  readonly title: string
  readonly body: string
  readonly points: readonly [string, string, string]
  readonly cta: string
  readonly href: string
  readonly ground: "abyss" | "mist" | "paper"
  readonly beta?: true
  readonly screen: ReactNode
}

function Card({ persona: p, index }: { readonly persona: Persona; readonly index: number }) {
  const { play, ref } = usePlay<HTMLDivElement>({ rootMargin: "0px 0px -12% 0px" })
  const dark = p.ground === "abyss"
  return (
    <article
      id={p.id}
      aria-labelledby={`${p.id}-kop`}
      data-ground={dark ? "dark" : undefined}
      className={cn(
        "relative isolate flex scroll-mt-28 flex-col overflow-hidden rounded-xl",
        index === 2 && "md:col-span-2 lg:col-span-1",
        dark
          ? "chapter bg-abyss text-mesh-ink"
          : p.ground === "mist"
          ? "bg-mist text-ink hairline"
          : "bg-paper text-ink hairline"
      )}
    >
      {dark
        ? (
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute inset-0 drafting-chalk [mask-image:linear-gradient(180deg,black,transparent_85%)]" />
          </div>
        )
        : null}
      <div className="flex flex-col gap-4 px-7 pt-8 pb-7 sm:px-8 sm:pt-9">
        <h3 id={`${p.id}-kop`} className="flex flex-wrap items-center gap-2.5 font-medium text-2xl sm:text-3xl">
          {p.title}
          {p.beta === true
            ? <span className="rounded-sm bg-arc-tint px-2 py-0.5 font-medium text-arc-ink text-xs">In de bèta</span>
            : null}
        </h3>
        <p className={cn("max-w-[44ch] text-md", dark ? "text-mesh-ink-2" : "text-ink-2")}>{p.body}</p>
        <ul className="flex flex-col gap-2">
          {p.points.map((pt) => (
            <li key={pt} className="flex items-start gap-2.5 text-base">
              <Check size={15} className={cn("mt-0.5 shrink-0", dark ? "text-mesh-ink-2" : "text-arc-ink")} />
              {pt}
            </li>
          ))}
        </ul>
        <a
          href={p.href}
          className={cn(
            "group/btn mt-1 inline-flex h-10 w-fit items-center gap-2 whitespace-nowrap rounded-md px-4 font-medium text-base transition-colors",
            dark
              ? "text-mesh-ink [box-shadow:inset_0_0_0_1px_color-mix(in_oklch,var(--mesh-ink)_40%,transparent)] hover:bg-mesh-ink/10"
              : "text-ink [box-shadow:inset_0_0_0_1px_color-mix(in_oklch,var(--ink)_30%,transparent)] hover:bg-ink/5"
          )}
        >
          {p.cta}
          <ArrowRight
            size={15}
            className="transition-transform duration-[240ms] ease-[var(--ease-out-expo)] group-hover/btn:translate-x-0.5"
          />
        </a>
      </div>
      {
        /* The window fills the foot and bleeds off the card's right and bottom edges; it rises into
          place as the row arrives, each card a beat after the one before. */
      }
      <div ref={ref} className="relative mt-auto h-[320px] sm:h-[380px]">
        <div
          data-play={play}
          style={{ transitionDelay: `${index * 140}ms` }}
          className={cn(
            "absolute top-0 left-7 overflow-hidden rounded-tl-lg outline window-lift transition-[transform,opacity] duration-[900ms] ease-[var(--ease-out-expo)] data-[play=false]:translate-y-16 data-[play=false]:opacity-0 sm:left-8",
            dark ? "outline-mesh-ink/15" : "outline-ink/10"
          )}
        >
          <div className="[zoom:0.5] sm:[zoom:0.62]">{p.screen}</div>
        </div>
      </div>
    </article>
  )
}

export function Personas() {
  const links = useMarketingLinks()
  const personas: ReadonlyArray<Persona> = [
    {
      id: "operators",
      title: "Voor operators",
      body:
        "Bestellingen, klantenservice, chargebacks en automatiseringen van al je Shopify-winkels op één scherm. De Insyte-agent doet het werk, binnen jouw regels.",
      points: [
        "Al je Shopify-winkels in één werkruimte",
        "Voorstellen voor tickets, geschillen en leveranciers",
        "Rollen en rechten voor je team"
      ],
      cta: "Naar de console",
      href: links.login,
      ground: "abyss",
      screen: <OperatorWindow />
    },
    {
      id: "leveranciers",
      title: "Voor leveranciers",
      body:
        "Je leverancier ziet alleen de bestellingen die hij voor jou levert, in zijn eigen portaal. Geen mails heen en weer.",
      points: [
        "Alleen de eigen bestellingen en producten",
        "Accepteren en verzenden met track & trace",
        "Een vertraging melden waar jij het ziet"
      ],
      cta: "Bekijk het leveranciersportaal",
      href: links.inApp("/supplier/dashboard"),
      ground: "mist",
      beta: true,
      screen: <SupplierWindow />
    },
    {
      id: "partners",
      title: "Voor partners",
      body:
        "Affiliates zien hun eigen links, conversies en uitbetalingen, met een niveau dat meegroeit. Commissies rekenen zichzelf uit.",
      points: [
        "Eigen links en een kortingscode",
        "Conversies en uitbetalingen per maand",
        "Niveaus die meegroeien: Brons, Zilver, Goud"
      ],
      cta: "Bekijk het partnerportaal",
      href: links.inApp("/affiliate/dashboard"),
      ground: "paper",
      beta: true,
      screen: <PartnerWindow />
    }
  ]

  return (
    <section id="oplossingen" aria-labelledby="oplossingen-kop" className="overflow-x-clip bg-glacier pb-2 sm:pb-3">
      <div className="mx-auto flex max-w-[44rem] flex-col items-center gap-5 px-4 py-20 text-center sm:px-8 sm:py-28">
        <h2 id="oplossingen-kop" className="font-medium text-4xl sm:text-display-sm">
          <span className="block text-ink">Eén platform voor de hele keten.</span>
          <span className="block text-ink-3">Jij, je leveranciers en je partners.</span>
        </h2>
        <p className="max-w-[50ch] text-ink-2 text-lg">
          Leveranciers en partners krijgen elk een eigen portaal en zien alleen hun deel. Jij houdt het overzicht.
        </p>
      </div>
      <div className="grid gap-2 px-2 sm:px-3 md:grid-cols-2 lg:grid-cols-3">
        {personas.map((p, i) => <Card key={p.id} persona={p} index={i} />)}
      </div>
    </section>
  )
}

import type { ReactNode } from "react"
import { ArrowRight } from "../../icons.tsx"
import { Frame } from "../frame.tsx"
import type { MarketingLinks } from "../links.tsx"
import { useMarketingLinks } from "../links.tsx"
import { Reveal, RevealItem } from "../motion.tsx"
import { OperatorWindow, PartnerWindow, SupplierWindow } from "../personas-screens.tsx"
import {
  BuilderMoment,
  EarningsMoment,
  EvidenceMoment,
  LinkMoment,
  OrdersMoment,
  PayoutMoment,
  ProblemMoment,
  ShipMoment,
  StatementMoment,
  SupplierScopeMoment,
  TicketMoment,
  TierMoment
} from "./moments.tsx"
import { Rising } from "./rising.tsx"
import { HeroBar, MarketingPage, PageHero } from "./shell.tsx"
import { type Step, StickySteps } from "./steps.tsx"

/*
 * /oplossingen/<persona>: one page per persona, on one skeleton. The hero carries the persona's own
 * portal, rising out of the abyss wrapper and lying flat as it scrolls in (the homepage's window,
 * here with the portal the persona logs into). Then a sticky sequence of four moments from that
 * portal, and the other two personas as the way on. The supplier and partner portals are in the
 * beta and say so: whether they ship in the first public release is undecided (PRODUCT.md).
 */

type Persona = "operators" | "leveranciers" | "partners"

const OTHERS: Record<
  Persona,
  { readonly title: string; readonly line: string; readonly path: string; readonly window: () => ReactNode }
> = {
  operators: {
    title: "Voor operators",
    line: "De console: bestellingen, klantenservice, chargebacks en automatiseringen van al je winkels.",
    path: "/oplossingen/operators",
    window: () => <OperatorWindow />
  },
  leveranciers: {
    title: "Voor leveranciers",
    line: "Een eigen portaal om bestellingen te accepteren, te verzenden en af te rekenen.",
    path: "/oplossingen/leveranciers",
    window: () => <SupplierWindow />
  },
  partners: {
    title: "Voor partners",
    line: "Eigen links, conversies en uitbetalingen, met een niveau dat meegroeit.",
    path: "/oplossingen/partners",
    window: () => <PartnerWindow />
  }
}

/** The other two personas, each a card with its portal cropped into it. */
function Others({ current }: { readonly current: Persona }) {
  const links = useMarketingLinks()
  const list = (Object.keys(OTHERS) as Array<Persona>).filter((p) => p !== current)
  return (
    <section aria-labelledby="anderen-kop" className="bg-glacier">
      <Frame inner="py-20 sm:py-28">
        <h2 id="anderen-kop" className="font-medium text-3xl text-ink sm:text-4xl">
          Eén platform voor de hele keten.
          <span className="block text-ink-3">Ieder met een eigen portaal.</span>
        </h2>
        <Reveal className="mt-12 grid gap-4 md:grid-cols-2">
          {list.map((p) => {
            const o = OTHERS[p]
            return (
              <RevealItem key={p} lift>
                <a
                  href={links.page(o.path)}
                  className="group/card flex h-full flex-col overflow-hidden rounded-xl bg-paper hairline"
                >
                  <div className="flex flex-col gap-2 p-6 sm:p-8">
                    <span className="flex items-center justify-between gap-3">
                      <span className="font-medium text-2xl text-ink">{o.title}</span>
                      <ArrowRight
                        size={18}
                        className="text-ink-3 transition-transform duration-[240ms] ease-[var(--ease-out-expo)] group-hover/card:translate-x-1 group-hover/card:text-ink"
                      />
                    </span>
                    <span className="max-w-[44ch] text-ink-2 text-md">{o.line}</span>
                  </div>
                  <div className="relative mt-auto h-[200px] overflow-hidden sm:h-[240px]">
                    <div className="absolute top-0 left-6 overflow-hidden rounded-tl-lg window-lift transition-transform duration-[600ms] ease-[var(--ease-out-expo)] group-hover/card:-translate-y-2 sm:left-8">
                      <div className="[zoom:0.5] sm:[zoom:0.6]">{o.window()}</div>
                    </div>
                  </div>
                </a>
              </RevealItem>
            )
          })}
        </Reveal>
      </Frame>
    </section>
  )
}

function SolutionPage(
  { links, persona, title, second, lede, actions, beta, window, steps, stepsTitle, stepsSecond }: {
    readonly links: MarketingLinks
    readonly persona: Persona
    readonly title: string
    readonly second: string
    readonly lede: string
    readonly actions: ReactNode
    readonly beta?: true
    readonly window: ReactNode
    readonly steps: ReadonlyArray<Step>
    readonly stepsTitle: string
    readonly stepsSecond: string
  }
) {
  return (
    <MarketingPage links={links}>
      <PageHero
        variant="notch"
        title={title}
        second={second}
        lede={lede}
        actions={
          <>
            {actions}
            {beta === true
              ? <span className="ml-1 rounded-sm bg-mesh-ink/12 px-2 py-1 text-mesh-ink text-xs">In de bèta</span>
              : null}
          </>
        }
        bleed={<Rising>{window}</Rising>}
      />
      <p className="mx-auto max-w-[1180px] px-4 text-center text-ink-3 text-sm sm:px-8">
        Voorbeeldwerkruimte: Northwind Clothing Co. is de demowinkel van de console, geen klant.
      </p>
      <StickySteps id={`${persona}-werk`} title={stepsTitle} second={stepsSecond} steps={steps} />
      <Others current={persona} />
    </MarketingPage>
  )
}

export function OperatorsPage({ links }: { readonly links: MarketingLinks }) {
  return (
    <SolutionPage
      links={links}
      persona="operators"
      title="Voor operators."
      second="Al je winkels, één scherm."
      lede="Bestellingen, klantenservice, chargebacks en automatiseringen van al je Shopify-winkels in één console. De Insyte-agent doet het werk binnen jouw regels; wat geld of klanten raakt, legt hij eerst aan je voor."
      actions={
        <>
          <HeroBar
            dark
            primary={{ href: links.page("/toegang"), label: "Toegang aanvragen" }}
            secondary={{ href: links.login, label: "Inloggen op de console" }}
          />
        </>
      }
      window={<OperatorWindow />}
      stepsTitle="Het werk van een dag."
      stepsSecond="Voorgetekend, niet overgenomen."
      steps={[
        {
          title: "Elke winkel in één lijst.",
          body:
            "Bestellingen van al je Shopify-winkels staan in één lijst, met de winkel erbij. Wat vertraagd is, komt bovenaan, met het bericht aan de leverancier al klaar.",
          points: ["Opgeslagen weergaven en filters", "Een rol beperken tot bepaalde winkels"],
          render: (on) => <OrdersMoment on={on} />
        },
        {
          title: "Onder elk ticket een concept.",
          body:
            "Gmail en Outlook komen in één inbox. Insyte leest de bestelling erbij en schrijft een antwoord in jouw toon, met de bronnen ernaast. Jij verstuurt.",
          points: ["Toewijzen aan een collega", "Concepten met bronnen"],
          render: (on) => <TicketMoment on={on} />
        },
        {
          title: "Bewijs vóór de deadline.",
          body:
            "Per chargeback van Stripe, Klarna of PayPal verzamelt Insyte het bewijs uit je bestelling, de track & trace en het klantgesprek. Indienen kan niet terug, dus dat doe jij.",
          points: ["Deadlines in de wachtrij en de agenda", "Bevestiging met het bedrag vóór indienen"],
          render: (on) => <EvidenceMoment on={on} />
        },
        {
          title: "Automatiseringen in gewone taal.",
          body:
            "Beschrijf wat er moet gebeuren; Insyte zet de stappen neer met de diensten die je al hebt, en je test de flow met een voorbeeldbestelling voordat hij live gaat.",
          points: ["Sjablonen uit de bibliotheek", "Versies en uitvoeringen bewaard"],
          render: (on) => <BuilderMoment on={on} />
        }
      ]}
    />
  )
}

export function LeveranciersPage({ links }: { readonly links: MarketingLinks }) {
  return (
    <SolutionPage
      links={links}
      persona="leveranciers"
      title="Voor leveranciers."
      second="Alleen wat je voor hen levert."
      lede="Een eigen portaal voor je fulfilmentpartner: de bestellingen die hij voor jou levert, accepteren en verzenden, problemen melden en per maand zien wat er openstaat. Geen mails heen en weer."
      beta
      actions={
        <>
          <HeroBar
            dark
            primary={{ href: links.inApp("/supplier/dashboard"), label: "Naar het leveranciersportaal" }}
            secondary={{ href: links.page("/toegang"), label: "Toegang aanvragen" }}
          />
        </>
      }
      window={<SupplierWindow />}
      stepsTitle="Overdracht zonder heen en weer."
      stepsSecond="Wat hij doet, zie jij in de bestelling."
      steps={[
        {
          title: "Alleen zijn eigen orderregels.",
          body:
            "Je leverancier ziet de regels die hij levert en het verzendadres. Het e-mailadres en telefoonnummer van je klant en de regels van andere leveranciers blijven buiten beeld.",
          render: (on) => <SupplierScopeMoment on={on} />
        },
        {
          title: "Accepteren en verzenden.",
          body:
            "Een bestelling gaat van Te accepteren naar Geaccepteerd naar Verzonden, met vervoerder en track & trace, ook in meer dan één pakket. Jij ziet het meteen op de bestelling.",
          points: ["Pakbon per bestelling", "Track & trace in bulk als CSV"],
          render: (on) => <ShipMoment on={on} />
        },
        {
          title: "Een probleem melden.",
          body:
            "Niet op voorraad of later klaar: de leverancier meldt het met een nieuwe overdrachtsdatum, en het komt bij jou binnen als ticket, op de bestelling.",
          render: (on) => <ProblemMoment on={on} />
        },
        {
          title: "Per maand wat er openstaat.",
          body:
            "Een afrekening per maand: de verzonden regels tegen de afgesproken inkoopprijs, min wat door de leverancier misging, met de status van de betaling.",
          render: (on) => <StatementMoment on={on} />
        }
      ]}
    />
  )
}

export function PartnersPage({ links }: { readonly links: MarketingLinks }) {
  return (
    <SolutionPage
      links={links}
      persona="partners"
      title="Voor partners."
      second="Eigen links, eigen uitbetalingen."
      lede="Affiliates krijgen een eigen portaal met hun links, conversies en uitbetalingen, en een niveau dat meegroeit. Commissies rekenen zichzelf uit; jij keurt goed."
      beta
      actions={
        <>
          <HeroBar
            dark
            primary={{ href: links.inApp("/affiliate/dashboard"), label: "Naar het partnerportaal" }}
            secondary={{ href: links.page("/partners/aanmelden"), label: "Partner worden" }}
          />
        </>
      }
      window={<PartnerWindow />}
      stepsTitle="Een programma dat zichzelf bijhoudt."
      stepsSecond="Van link tot uitbetaling."
      steps={[
        {
          title: "Eigen links, met een QR-code.",
          body:
            "Een partner kiest een bestemming in je winkel, geeft de link een naam en UTM-codes, en krijgt er een QR-code bij. Een eigen kortingscode hoort erbij.",
          render: (on) => <LinkMoment on={on} />
        },
        {
          title: "Zien wat elke link doet.",
          body:
            "Conversies en verdiende commissie per week en per link, zodat een partner weet waar zijn publiek koopt.",
          render: (on) => <EarningsMoment on={on} />
        },
        {
          title: "Een niveau dat meegroeit.",
          body:
            "Brons, Zilver en Goud, naar het aantal conversies per kwartaal. Het niveau stijgt vanzelf en de commissie gaat mee.",
          render: (on) => <TierMoment on={on} />
        },
        {
          title: "Uitbetaling per maand.",
          body:
            "Een conversie wacht de retourtermijn af, wordt goedgekeurd en daarna uitbetaald, met een overzicht en factuur per maand.",
          render: (on) => <PayoutMoment on={on} />
        }
      ]}
    />
  )
}

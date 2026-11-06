import { PlateView } from "../../../app/dashboard/plate.tsx"
import { Steps } from "../../../app/dashboard/setup-steps.tsx"
import { Button } from "../../../components/button.tsx"
import type { Plate } from "../../../data-source/types.ts"
import { Undo2 } from "../../../icons.tsx"
import { cn } from "../../../lib/utils.ts"
import { SoonTag } from "../../../marketing/agent-panels.tsx"
import { HeroBar } from "../../../marketing/pages/shell.tsx"
import { Orbit } from "../../../marketing/statement.tsx"
import { Pair, RuleSheet, SectionPage } from "../page.tsx"
import { useSpecimen } from "../state.tsx"
import { Lockup } from "./logo.tsx"

/*
 * 01 Merk. The positioning, the mechanism, De Blauwdruk, the principles, what we may claim, the
 * voice and the Dutch rules, and three applications built from the real parts. The one product
 * piece here is the proposal plate, because it is the brand idea: the product proposes, the
 * operator decides. It is the demo workspace's (Northwind), and is said to be.
 */

const C = "merk" as const

const eur = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" })
const day = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long" })
const pct = new Intl.NumberFormat("nl-NL", { style: "percent", maximumFractionDigits: 1 })

/** The demo workspace's Allure proposal, as `fixtures/mock-data/plates.ts` draws it. */
export const DEMO_PLATE: Plate = {
  number: "SUP-0318",
  heading: "Allure aansporen over drie bestellingen",
  body:
    "Getekend op basis van de vertragingsmelding van de leverancier zelf voor SKU-2148. Eén bericht, de drie bestelnummers en een leverdatum om te bevestigen.",
  dimension: "tot 17:00 vandaag",
  before: { label: "Zoals het record nu is", value: "In afwachting · geen contact met leverancier · €612,40 risico" },
  after: { label: "Zoals getekend", value: "Aangespoord · datum gevraagd · klanten op de hoogte" },
  change: "wat dit voorstel verandert",
  witness: "Northwind US",
  state: "getekend, niet uitgevoerd",
  confidence: "zekerheid 3,8",
  fileLabel: "Versturen zoals getekend"
}

/** The plate, live, drawn the way the dashboard draws it. Its buttons do nothing here. */
const noop = () => {}

export function DemoPlate() {
  return (
    <div className="flex h-[620px] w-full max-w-[436px] overflow-hidden rounded-lg">
      <PlateView plate={DEMO_PLATE} drawing={0} phase="drawn" onFile={noop} onRedraw={noop} onDiscard={noop} />
    </div>
  )
}

const PRINCIPLES = [
  {
    title: "De agent werkt, jij stelt de regels",
    body:
      "Elke actie noemt de regel waaronder ze liep, laat zien wat de agent las en is terug te draaien waar dat kan. Overdragen of niets doen is een geldige uitkomst."
  },
  {
    title: "Rustig als standaard",
    body: "De drie of vier dingen van vandaag bovenaan, de rest uit beeld tot je het nodig hebt."
  },
  {
    title: "Precisie is vertrouwen",
    body: "Geld, klanten, chargebacks: elk getal is te herleiden tot waar het vandaan komt."
  },
  {
    title: "Dicht waar het moet",
    body: "Tabellen lopen strak, een hero ademt. Het ritme tussen die twee is de persoonlijkheid."
  },
  {
    title: "Beweer niets wat we niet laten zien",
    body: "Geen klanten, geen cijfers, geen citaten. Het mechanisme zelf is het bewijs."
  }
] as const

const VOICE = [
  { wel: "Hier is het concept.", niet: "Ik denk dat je misschien zou kunnen overwegen om dit concept te gebruiken." },
  {
    wel: "Ticket #5142 toegewezen aan Amber, onder Zelf doen. Ongedaan maken.",
    niet: "Ik heb het alvast voor je geregeld!"
  },
  { wel: "Terugbetaling verstuurd.", niet: "Gelukt! Je terugbetaling is helemaal onderweg!" },
  { wel: "Verbinding met Shopify verbroken. Opnieuw koppelen.", niet: "Oeps, sorry! Er ging iets mis." },
  { wel: "Nog geen bestellingen", niet: "Hier is helaas nog niks te zien" }
] as const

/** The autonomy setting per kind of action, with its defaults from ADR-0027. Planned, and labelled so. */
const AUTONOMY = [
  { action: "Status of prioriteit zetten", level: "Zelf doen" },
  { action: "Ticket toewijzen", level: "Zelf doen" },
  { action: "Klant of leverancier mailen", level: "Eerst vragen" },
  { action: "Terugbetalen of annuleren", level: "Eerst vragen" },
  { action: "Bewijs indienen bij Klarna", level: "Vraagt altijd" }
] as const

function Autonomy() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="font-medium text-lg text-mesh-ink">Hoe ver gaat de agent</span>
        <SoonTag dark />
      </div>
      <ul className="flex flex-col">
        {AUTONOMY.map((a) => (
          <li key={a.action} className="relative flex items-baseline justify-between gap-6 py-3">
            <span aria-hidden className="absolute inset-x-0 bottom-0 h-px dash-x-chalk" />
            <span className="text-md text-mesh-ink">{a.action}</span>
            <span className="shrink-0 text-mesh-ink-2 text-sm">{a.level}</span>
          </li>
        ))}
      </ul>
      <p className="text-mesh-ink-2 text-sm">
        Elke actie in het logboek: wat, waarom, onder welke regel. Ongedaan te maken waar dat kan.
      </p>
    </div>
  )
}

function Statement() {
  return (
    <div className="flex max-w-[24ch] flex-col gap-8">
      <p className="font-medium text-3xl text-ink [hyphens:auto] sm:text-4xl lg:text-display">
        Wat Shopify is voor webshopbouwers,
        <span className="block text-ink-3">is Insyte voor dropshippers.</span>
      </p>
      <p className="max-w-[48ch] text-ink-2 text-lg">
        De plek waar je het bedrijf vanuit runt: bestellingen, klanten, leveranciers en geschillen op één scherm. Niet
        nog een dashboard ernaast.
      </p>
    </div>
  )
}

function Blueprint() {
  return (
    <div className="grid w-full max-w-[920px] overflow-hidden rounded-lg md:grid-cols-2">
      <div
        data-ground="dark"
        className="relative flex min-h-[320px] flex-col justify-between gap-6 bg-abyss p-6 text-mesh-ink"
      >
        <div aria-hidden className="absolute inset-0 drafting-chalk" />
        <span className="relative font-medium text-xl">Blauw: wat de agent eerst vraagt</span>
        <div className="relative flex flex-col gap-2">
          <span className="relative h-px w-full dash-x-chalk" />
          <span className="flex justify-between text-mesh-ink-2 text-sm">
            <span>SUP-0318</span>
            <span>getekend, niet uitgevoerd</span>
          </span>
        </div>
      </div>
      <div className="flex min-h-[320px] flex-col justify-between gap-6 bg-paper p-6 ruled">
        <span className="font-medium text-ink text-xl">Papier: waar jij werkt</span>
        <ul className="flex flex-col text-sm">
          {["#2049 · Aangespoord", "#2048 · Onderweg", "#2047 · Bezorgd"].map((r, i) => (
            <li key={r} className={cn("px-3 py-2.5 text-ink-2", i % 2 === 0 && "bg-mist")}>{r}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Applications() {
  const { still } = useSpecimen()
  return (
    <div className="grid w-full max-w-[1120px] gap-4 md:grid-cols-3">
      <article
        data-ground="dark"
        className="relative isolate flex aspect-square flex-col justify-between overflow-hidden rounded-lg bg-abyss p-6 text-mesh-ink"
      >
        <div
          aria-hidden
          className="absolute inset-0 -z-10 drafting-chalk [mask-image:linear-gradient(180deg,black,transparent)]"
        />
        <Lockup tile={24} text="text-md" dark />
        <div className="flex flex-col gap-5">
          <p className="font-medium text-3xl">
            De Insyte-agent doet het werk.
            <span className="block text-mesh-ink-2">Binnen jouw regels.</span>
          </p>
          <HeroBar dark primary={{ href: "/site/toegang", label: "Toegang aanvragen" }} />
        </div>
      </article>
      <article className="relative flex aspect-square flex-col justify-between overflow-hidden bg-mist p-6 ruled">
        <Lockup tile={24} mark={17} text="text-md" />
        <div className="flex justify-center">
          <span className="rounded-lg bg-abyss p-5">
            <Steps done={3} total={7} still={still} className="block shrink-0" />
          </span>
        </div>
        <p className="font-medium text-2xl text-ink">
          Nog vier stappen,
          <span className="block text-ink-3">dan draait Insyte voor je winkel.</span>
        </p>
      </article>
      <article className="relative flex aspect-square flex-col justify-between overflow-hidden bg-paper p-6 ruled">
        <div className="flex items-start justify-between gap-4">
          <Lockup tile={24} mark={17} text="text-md" />
          <span className="text-ink-3 text-xs">Private bèta</span>
        </div>
        <div className="flex justify-center">
          <div className="relative size-[150px]">
            <div className="absolute top-0 left-0 origin-top-left scale-[0.646]">
              <Orbit />
            </div>
          </div>
        </div>
        <p className="font-medium text-2xl text-ink">
          Al je koppelingen,
          <span className="block text-ink-3">op één scherm.</span>
        </p>
      </article>
    </div>
  )
}

export function MerkChapter() {
  return (
    <>
      <SectionPage
        chapter={C}
        id="positie"
        ground="glacier"
        body={
          <p>
            Insyte is het besturingssysteem voor dropshipping: voor zelfstandige operators en kleine teams die een of
            meer Shopify-winkels vanaf een laptop runnen.
          </p>
        }
        use={["De eerste zin van elke pagina die uitlegt wat Insyte is."]}
        avoid={["\"Nog een dashboard\", \"alles-in-één\" of een belofte in uren."]}
      >
        <Statement />
      </SectionPage>

      <SectionPage
        chapter={C}
        id="mechanisme"
        ground="abyss"
        status="Live"
        source="app/dashboard/plate.tsx · demowerkruimte"
        motion
        replay
        body={
          <>
            <p>
              De Insyte-agent doet het werk, binnen de regels die jij stelt. Binnenkort kies je per soort actie hoe ver
              hij gaat: Zelf doen, Eerst vragen of Nooit. Geld en klantcontact staan standaard op Eerst vragen; wat niet
              terug kan, vraagt altijd.
            </p>
            <p>
              Eerst vragen ziet er zo uit: de agent tekent een voorstel als een plaat, en pas als jij het uitvoert wordt
              het een record. Elke actie wordt vastgelegd met wat hij las en waarom, en wat terug kan, maak je ongedaan.
            </p>
          </>
        }
        use={["Het idee achter elke pagina: de agent werkt, jij stelt de regels."]}
        avoid={[
          "Een actie zonder regel, zonder logboek of zonder weg terug.",
          "Zelf doen of de klantagent presenteren alsof ze er al zijn."
        ]}
      >
        <div className="grid w-full max-w-[960px] items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,436px)]">
          <Autonomy />
          <DemoPlate />
        </div>
      </SectionPage>

      <SectionPage
        chapter={C}
        id="blauwdruk"
        ground="mist"
        body={
          <p>
            De noordster is De Blauwdruk: het plan in wit op blauw, getekend voordat er iets gebouwd wordt. Blauw is wat
            de agent je eerst voorlegt; papier is waar het werk staat.
          </p>
        }
        use={["Abyss voor wat de agent eerst vraagt, papier voor wat al een record is."]}
        avoid={["Blauw als versiering van een vlak dat niets voorstelt."]}
      >
        <Blueprint />
      </SectionPage>

      <SectionPage
        chapter={C}
        id="principes"
        ground="paper"
        source="PRODUCT.md"
        body={<p>Vijf principes uit PRODUCT.md. Elke keuze in dit boek is er een gevolg van.</p>}
      >
        <RuleSheet rules={PRINCIPLES} />
      </SectionPage>

      <SectionPage
        chapter={C}
        id="beweren"
        ground="glacier"
        body={
          <>
            <p>
              Er zijn geen klanten, geen logo's van klanten, geen citaten en geen gepubliceerde cijfers. Wat we wel
              hebben is het mechanisme zelf, en de echte merken van de diensten waar Insyte mee koppelt.
            </p>
            <p>
              Niet zoals: Stripe en zijn klonen, het SaaS-sjabloon met drie kaarten, neon en AI-gloed, de warmte van
              Mailchimp, grijze enterprise-B2B.
            </p>
          </>
        }
      >
        <Pair
          wel={
            <>
              Het mechanisme laten zien, met de echte onderdelen, op de demowerkruimte Northwind, en die zo noemen. Zelf
              doen, de klantagent en MCP heten binnenkort.
            </>
          }
          niet={
            <>
              Een klantenlijst, een citaat van een oprichter, "acht uur per week bespaard" zonder bewijs, of doen alsof
              de agent al zelf handelt of MCP er al is.
            </>
          }
        />
      </SectionPage>

      <SectionPage
        chapter={C}
        id="stem"
        ground="paper"
        body={
          <p>
            Gewoon en zeker. Geen uitroeptekens, geen excuses, geen SaaS-glimlach, geen mascotte. Insyte zegt "hier is
            het concept", niet "ik denk dat je zou kunnen overwegen".
          </p>
        }
        use={["Korte zinnen die het getal noemen en wat het veranderde."]}
        avoid={["Uitroeptekens, \"oeps\", \"helaas\" of een emoji."]}
      >
        <div className="flex w-full max-w-[920px] flex-col gap-6">
          <ul className="flex flex-col">
            {VOICE.map((v) => (
              <li key={v.wel} className="relative grid gap-2 py-4 sm:grid-cols-2 sm:gap-8">
                <span aria-hidden className="absolute inset-x-0 bottom-0 h-px dash-x" />
                <span className="flex items-baseline gap-3 text-ink text-lg">
                  <span aria-hidden className="size-2 shrink-0 rounded-[2px] bg-arc" />
                  {v.wel}
                </span>
                <span className="flex items-baseline gap-3 text-ink-3 text-lg line-through decoration-ink-4">
                  <span aria-hidden className="size-2 shrink-0 rounded-[2px] bg-ink-4" />
                  {v.niet}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex justify-center">
            <div className="flex items-center gap-4 rounded-xl px-4 py-3 panel-raised">
              <span className="text-ink text-sm">Terugbetaling verstuurd · € 89,95</span>
              <Button size="sm" variant="ghost">
                <Undo2 />
                Ongedaan maken
              </Button>
            </div>
          </div>
        </div>
      </SectionPage>

      <SectionPage
        chapter={C}
        id="nederlands"
        ground="mist"
        source="docs/dutch-copy.md"
        body={
          <>
            <p>
              Alles is Nederlands. Je en jij, nooit u. Zinsletters overal. Getallen, bedragen en datums via Intl in
              nl-NL. Knoppen zijn gebiedende wijs en zeggen wat ze doen.
            </p>
            <p>Merk- en productnamen blijven zoals ze zijn: Insyte, Shopify, Klarna.</p>
          </>
        }
        use={["De woordenlijst in docs/dutch-copy.md, elke keer."]}
        avoid={["\"Submit\", \"OK\" of een knop die niet zegt wat hij doet."]}
      >
        <div className="grid w-full max-w-[920px] gap-8 md:grid-cols-2">
          <dl className="flex flex-col">
            {[
              ["Bedrag", eur.format(1594.2)],
              ["Datum", day.format(new Date(2026, 4, 26))],
              ["Procent", pct.format(0.076)],
              ["Telling", `${(1594).toLocaleString("nl-NL")} bestellingen`],
              ["Bèta", "Private bèta, met accent"]
            ].map(([k, v]) => (
              <div key={k} className="relative flex justify-between gap-6 py-3">
                <span aria-hidden className="absolute inset-x-0 bottom-0 h-px dash-x" />
                <dt className="text-ink-3 text-sm">{k}</dt>
                <dd className="text-base text-ink tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-col gap-3">
            <span className="text-ink-3 text-sm">Knoppen</span>
            <div className="flex flex-wrap gap-2">
              <Button>Uitvoeren</Button>
              <Button variant="outline">Negeren</Button>
              <Button variant="outline">Opslaan</Button>
              <Button variant="ghost">Opnieuw koppelen</Button>
              <Button variant="secondary">Toegang aanvragen</Button>
            </div>
          </div>
        </div>
      </SectionPage>

      <SectionPage
        chapter={C}
        id="toepassing"
        ground="glacier"
        status="Live"
        motion
        body={
          <p>
            Drie formaten voor een bericht of een advertentie, gebouwd uit de echte onderdelen: het woordmerk, de
            knoppenbalk van de site, de stappen van de eerste dag en de baan van koppelingen.
          </p>
        }
        use={["Eén boodschap per kaart, met het mechanisme of een echte koppeling."]}
        avoid={["Een stockfoto, een verzonnen klant of een getal zonder bron."]}
      >
        <Applications />
      </SectionPage>
    </>
  )
}

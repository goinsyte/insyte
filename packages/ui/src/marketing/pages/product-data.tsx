import type { ReactNode } from "react"
import {
  Archive,
  AtSign,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Filter,
  FlaskConical,
  GitMerge,
  type IconComponent,
  Inbox,
  LayoutTemplate,
  ListFilter,
  Lock,
  MessagesSquare,
  Plug,
  Send,
  ShieldCheck,
  Sparkles,
  Store,
  Tag,
  Truck,
  Workflow
} from "../../icons.tsx"
import { AnalyticsMoment, AskMoment, AutonomyMoment, ScopesMoment, SourcesMoment } from "./ai-moments.tsx"
import { BuilderMoment, EvidenceMoment, OrdersMoment, TicketMoment } from "./moments.tsx"
import {
  ChatMoment,
  ConfirmMoment,
  DeadlineMoment,
  InboxMoment,
  NudgeMoment,
  OutcomeMoment,
  RunsMoment,
  TagMoment,
  TemplatesMoment,
  TimelineMoment,
  ViewsMoment
} from "./product-moments.tsx"
import type { Step } from "./steps.tsx"

/*
 * The product pages, one config per area. `product.tsx` renders every one of them with the same
 * template in the same order — hero with one render, four steps, six features, the rest of the
 * product, the close — so only what is said and shown differs. Every line is something the console
 * does today (the screens named beside each area), drawn on the demo workspace.
 */

export type Area = "bestellingen" | "klantenservice" | "chargebacks" | "automatiseringen" | "insyte-ai"

export type Feature = { readonly Icon: IconComponent; readonly title: string; readonly line: string }

export type ProductConfig = {
  readonly id: Area
  readonly Icon: IconComponent
  /** For the cross-links row. */
  readonly name: string
  readonly line: string
  readonly title: string
  readonly second: string
  readonly lede: string
  readonly consolePath: string
  readonly hero: (on: boolean) => ReactNode
  readonly stepsTitle: string
  readonly stepsSecond: string
  readonly steps: readonly [Step, Step, Step, Step]
  readonly featuresTitle: string
  readonly features: readonly [Feature, Feature, Feature, Feature, Feature, Feature]
  readonly meta: { readonly title: string; readonly description: string }
}

export const PRODUCT_PAGES: ReadonlyArray<ProductConfig> = [
  {
    // routes/_admin/orders, dashboard live ticker, settings/roles (store scope)
    id: "bestellingen",
    Icon: Store,
    name: "Bestellingen",
    line: "Elke winkel in één lijst, de vertraagde bovenaan.",
    title: "Bestellingen.",
    second: "Elke winkel in één lijst.",
    lede:
      "Alle bestellingen van al je Shopify-winkels op één plek, met wat vertraagd is bovenaan en het bericht aan de leverancier al geschreven.",
    consolePath: "/orders",
    hero: (on) => <OrdersMoment on={on} bare />,
    stepsTitle: "Van vertraging tot verzonden.",
    stepsSecond: "Zonder tabbladen erbij.",
    steps: [
      {
        title: "De vertraagde bovenaan.",
        body:
          "Bestellingen van al je winkels in één lijst, met de winkel erbij. Wat achterloopt, wordt gemarkeerd en komt bovenaan.",
        render: (on) => <OrdersMoment on={on} />
      },
      {
        title: "Het bericht aan de leverancier staat klaar.",
        body:
          "Insyte schrijft het bericht om de verzending te laten bevestigen, met de bestellingen als bron. Jij verstuurt, past aan of negeert.",
        render: (on) => <NudgeMoment on={on} />
      },
      {
        title: "Labels in één keer.",
        body: "Selecteer bestellingen en geef ze samen een label, of zet het label op de bestelling zelf.",
        render: (on) => <TagMoment on={on} />
      },
      {
        title: "Elke overdracht in de bestelling.",
        body:
          "Wat de leverancier in zijn portaal doet, komt in de tijdlijn van de bestelling: geaccepteerd, verzonden, met vervoerder en pakketten.",
        render: (on) => <TimelineMoment on={on} />
      }
    ],
    featuresTitle: "Wat er verder in zit.",
    features: [
      {
        Icon: Filter,
        title: "Filters die je bewaart",
        line: "Regels als een zin, groepen met en/of, opgeslagen als weergave."
      },
      { Icon: Tag, title: "Labels en bulkacties", line: "Meerdere bestellingen tegelijk labelen of bijwerken." },
      { Icon: Clock, title: "Vertraagd gemarkeerd", line: "Wat achterloopt, valt op in de lijst en op Start." },
      { Icon: Send, title: "Leverancier aansporen", line: "Als voorstel, met de bestellingen als bron." },
      { Icon: Lock, title: "Winkels per rol", line: "Een rol ziet alleen de winkels waaraan hij werkt." },
      {
        Icon: Truck,
        title: "Overdrachten in de tijdlijn",
        line: "Geaccepteerd en verzonden, zoals de leverancier het meldt."
      }
    ],
    meta: {
      title: "Bestellingen — elke Shopify-winkel in één lijst | Insyte",
      description:
        "Alle bestellingen van al je Shopify-winkels op één plek, de vertraagde bovenaan, het bericht aan de leverancier klaar en elke overdracht in de tijdlijn."
    }
  },
  {
    // routes/_admin/inbox, tickets, chats
    id: "klantenservice",
    Icon: Inbox,
    name: "Klantenservice",
    line: "Inbox, tickets en chats, met een concept onder elk ticket.",
    title: "Klantenservice.",
    second: "Een concept onder elk ticket.",
    lede:
      "Gmail en Outlook in één inbox, tickets met de bestelling ernaast en chats met je team en je leveranciers. Insyte schrijft het antwoord; jij verstuurt.",
    consolePath: "/tickets",
    hero: (on) => <InboxMoment on={on} bare />,
    stepsTitle: "Van mail tot antwoord.",
    stepsSecond: "Met de bestelling ernaast.",
    steps: [
      {
        title: "Eén inbox voor elke mailbox.",
        body:
          "Koppel Gmail en Outlook. Gesprekken komen samen in één inbox, gegroepeerd per mailbox, en je wijst ze toe aan een collega.",
        render: (on) => <InboxMoment on={on} />
      },
      {
        title: "Het antwoord in jouw toon.",
        body:
          "Insyte leest het ticket en de bestelling erbij, en schrijft een concept met de bronnen ernaast. Jij past aan en verstuurt.",
        render: (on) => <TicketMoment on={on} />
      },
      {
        title: "Weergaven die opruimen.",
        body:
          "Open, aan mij toegewezen, uitgesteld, gearchiveerd, prullenbak en spam. Een ticket uitstellen haalt het uit je lijst tot het weer telt.",
        render: (on) => <ViewsMoment on={on} />
      },
      {
        title: "Chats met je team en je leverancier.",
        body:
          "Kanalen voor het team en met je leveranciers, met bestellingen als verwijzing en vermeldingen die bij de juiste persoon aankomen.",
        render: (on) => <ChatMoment on={on} />
      }
    ],
    featuresTitle: "Wat er verder in zit.",
    features: [
      { Icon: Inbox, title: "Gmail en Outlook", line: "Elke gekoppelde mailbox in één gedeelde inbox." },
      { Icon: AtSign, title: "Toewijzen en vermelden", line: "Een gesprek naar een collega, een @ in een reactie." },
      { Icon: Archive, title: "Uitgesteld, prullenbak en spam", line: "Weergaven die je lijst leeg houden." },
      {
        Icon: Sparkles,
        title: "Concepten met bronnen",
        line: "Elk antwoord met de bestelling en het gesprek waarop het rust."
      },
      { Icon: MessagesSquare, title: "Teamchats", line: "Kanalen, ook met je leveranciers, met bijlagen en emoji." },
      { Icon: Plug, title: "Bron bij elk ticket", line: "Of het via Gmail, Shopify of Klarna binnenkwam." }
    ],
    meta: {
      title: "Klantenservice — inbox, tickets en chats met een concept | Insyte",
      description:
        "Gmail en Outlook in één inbox, tickets met de bestelling ernaast en een concept in jouw toon onder elk ticket. Jij verstuurt."
    }
  },
  {
    // routes/_admin/chargebacks
    id: "chargebacks",
    Icon: ShieldCheck,
    name: "Chargebacks",
    line: "Het bewijs verzameld, ruim voor de deadline.",
    title: "Chargebacks.",
    second: "Bewijs vóór de deadline.",
    lede:
      "Per geschil van Stripe, Klarna of PayPal verzamelt Insyte het bewijs uit je bestelling, de track & trace en het klantgesprek. Indienen doe jij.",
    consolePath: "/chargebacks",
    hero: (on) => <EvidenceMoment on={on} bare />,
    stepsTitle: "Van geschil tot uitkomst.",
    stepsSecond: "Elke deadline in beeld.",
    steps: [
      {
        title: "Elk geschil met zijn deadline.",
        body:
          "Geschillen van al je betaalproviders in één lijst, de dichtstbijzijnde deadline bovenaan, ook in de wachtrij op Start en in de agenda.",
        render: (on) => <DeadlineMoment on={on} />
      },
      {
        title: "Het bewijspakket stelt zichzelf samen.",
        body:
          "Bestelbevestiging, track & trace met bezorgscan, het klantgesprek en de productpagina: Insyte zoekt het op en legt het klaar.",
        render: (on) => <EvidenceMoment on={on} />
      },
      {
        title: "Eerst bevestigen, dan indienen.",
        body:
          "Indienen bij een provider kan niet terug. Daarom vraagt Insyte eerst om bevestiging, met het bedrag en wat er gebeurt.",
        render: (on) => <ConfirmMoment on={on} />
      },
      {
        title: "Zien hoe het afliep.",
        body: "Ingediend, gewonnen of verloren, zoals de provider het terugmeldt, per geschil bewaard.",
        render: (on) => <OutcomeMoment on={on} />
      }
    ],
    featuresTitle: "Wat er verder in zit.",
    features: [
      { Icon: Plug, title: "Stripe, Klarna en PayPal", line: "Geschillen van elke provider in één lijst." },
      {
        Icon: Calendar,
        title: "Deadlines in de agenda",
        line: "Op Start en in de wachtrij, de dichtstbijzijnde eerst."
      },
      { Icon: FileText, title: "Bewijspakket", line: "Uit de bestelling, de vervoerder en het gesprek." },
      { Icon: CheckCircle2, title: "Bevestigen vóór indienen", line: "Met het bedrag en wat er gebeurt." },
      { Icon: GitMerge, title: "Uitkomst bijgehouden", line: "Ingediend, gewonnen of verloren per geschil." },
      { Icon: Lock, title: "Indienen als recht", line: "Alleen rollen met het recht dienen bewijs in." }
    ],
    meta: {
      title: "Chargebacks — bewijs vóór de deadline | Insyte",
      description:
        "Per geschil van Stripe, Klarna of PayPal verzamelt Insyte het bewijs en zet het pakket klaar, ruim voor de deadline. Indienen doe jij."
    }
  },
  {
    // routes/_admin/automations; lib/automation-templates.ts; docs/backend/security.md §3
    id: "automatiseringen",
    Icon: Workflow,
    name: "Automatiseringen",
    line: "Beschreven in gewone taal, getest voor ze live gaan.",
    title: "Automatiseringen.",
    second: "In gewone taal.",
    lede:
      "Beschrijf wat er moet gebeuren; Insyte zet de stappen neer met de diensten die je al hebt. Je test een flow met een voorbeeldbestelling voordat hij live gaat.",
    consolePath: "/automations",
    hero: (on) => <TemplatesMoment on={on} bare />,
    stepsTitle: "Van zin tot flow.",
    stepsSecond: "Met een test ertussen.",
    steps: [
      {
        title: "Een zin wordt een flow.",
        body:
          "Schrijf wat je wilt; Insyte legt de trigger, de stappen en de diensten neer, met AI-stappen waar een tekst geschreven of gelezen moet worden.",
        render: (on) => <BuilderMoment on={on} />
      },
      {
        title: "Of begin bij een sjabloon.",
        body:
          "Late levering, track & trace, terugbetalingen met goedkeuring, lage voorraad: de bibliotheek heeft ze klaar, met de diensten erbij.",
        render: (on) => <TemplatesMoment on={on} />
      },
      {
        title: "Elke uitvoering bewaard.",
        body: "Versies en uitvoeringen blijven bewaard, stap voor stap, zodat je ziet wat een flow deed en wanneer.",
        render: (on) => <RunsMoment on={on} />
      },
      {
        title: "Rechten per flow.",
        body:
          "Een flow handelt met de rechten die je hem geeft. Zet je er een uit, dan slaat de volgende uitvoering die stap over.",
        render: (on) => <ScopesMoment on={on} />
      }
    ],
    featuresTitle: "Wat er verder in zit.",
    features: [
      { Icon: LayoutTemplate, title: "Sjablonen", line: "Uit de bibliotheek, met de diensten erbij." },
      { Icon: Sparkles, title: "AI-stappen", line: "Samenvatten, de bedoeling herkennen, een tekst schrijven." },
      {
        Icon: FlaskConical,
        title: "Testen met een voorbeeld",
        line: "Een bestelling door de flow halen voor hij live gaat."
      },
      { Icon: ListFilter, title: "Versies en uitvoeringen", line: "Elke versie en elke run, stap voor stap." },
      { Icon: Lock, title: "Rechten per flow", line: "Een stap draait alleen met het recht ervoor." },
      { Icon: Plug, title: "Diensten die je al hebt", line: "Shopify, Gmail, Klaviyo, Slack en Stripe als stappen." }
    ],
    meta: {
      title: "Automatiseringen — in gewone taal | Insyte",
      description:
        "Beschrijf wat er moet gebeuren; Insyte zet de stappen neer met de diensten die je al hebt. Testen met een voorbeeldbestelling, versies en uitvoeringen bewaard."
    }
  },
  {
    // routes/_admin/ask, analytics; lib/ask/scripts.ts; docs/backend/ai.md
    id: "insyte-ai",
    Icon: Sparkles,
    name: "Insyte AI en analyse",
    line: "Een agent die het werk doet, binnen jouw regels.",
    title: "Insyte AI.",
    second: "Een agent, binnen jouw regels.",
    lede:
      "De Insyte-agent leest je wachtrij, je bestellingen en je gesprekken, antwoordt met bronnen en zet het werk klaar. Wat geld of klanten raakt, legt hij eerst aan je voor. Binnenkort kies je per actie hoe ver hij gaat.",
    consolePath: "/ask",
    hero: (on) => <AskMoment on={on} bare />,
    stepsTitle: "Van vraag tot gedaan werk.",
    stepsSecond: "Met de bron erbij.",
    steps: [
      {
        title: "Vraag het je werkruimte.",
        body:
          "Vraag Insyte leest de records die erbij horen en antwoordt in gewoon Nederlands, met de bestellingen en zaken als chips die je opent.",
        render: (on) => <AskMoment on={on} />
      },
      {
        title: "Wat Insyte las, staat erbij.",
        body:
          "Bij elk antwoord zie je welke bronnen Insyte las en welke records het opende, voordat je iets met het voorstel doet.",
        render: (on) => <SourcesMoment on={on} />
      },
      {
        title: "Per actie bepaal jij hoe ver hij gaat.",
        body:
          "Wat geld of klanten raakt, staat klaar als voorstel: jij verstuurt, past aan of negeert. Binnenkort kies je per soort actie Zelf doen, Eerst vragen of Nooit, en staat alles wat de agent zelf doet in een logboek met Ongedaan maken.",
        render: (on) => <AutonomyMoment on={on} />
      },
      {
        title: "De analyse schrijft het op.",
        body:
          "Insyte leest je cijfers en schrijft op wat er veranderde en waardoor, elke bevinding met een eigen grafiek en bron.",
        render: (on) => <AnalyticsMoment on={on} />
      }
    ],
    featuresTitle: "Wat de agent voor je doet.",
    features: [
      { Icon: Sparkles, title: "Voorstellen", line: "Wat op Eerst vragen staat: uitvoeren, bewerken of negeren." },
      { Icon: ListFilter, title: "Analyse", line: "Bevindingen in woorden, met een grafiek en bron." },
      { Icon: Send, title: "Concept-antwoorden", line: "Onder elk ticket, in jouw toon." },
      { Icon: FileText, title: "Bewijspakketten", line: "Per chargeback, ruim voor de deadline." },
      { Icon: Workflow, title: "AI-stappen in flows", line: "Samenvatten, herkennen en schrijven als stap." },
      { Icon: Lock, title: "Geen training op je data", line: "Invoer gaat niet naar het trainen van modellen." }
    ],
    meta: {
      title: "Insyte AI — een agent binnen jouw regels | Insyte",
      description:
        "De Insyte-agent antwoordt met bronnen uit je werkruimte, zet het werk klaar en legt wat geld of klanten raakt eerst aan je voor. Zelfstandigheid per actie en een MCP-server komen binnenkort."
    }
  }
]

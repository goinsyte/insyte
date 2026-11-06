/*
 * Every question the site answers, in one place: the homepage shows the ones marked `home`, /vragen
 * shows all of them by group, and /prijzen shows the pricing group. One list, so the three never
 * disagree.
 *
 * Answered only with what is true today (PRODUCT.md): the console's own screens, the permission
 * catalogue (`packages/ui/src/app/lib/permissions.ts`) and `docs/backend/security.md` / `ai.md`. The old
 * site promised a certification date, export formats, a retention period, setup times and support
 * hours; none of those are facts yet, so none of them are here. Where something is undecided the
 * answer says so.
 */

type FaqLink = { readonly label: string; readonly path: string }

export type FaqItem = {
  /** The question's anchor on /vragen: `/vragen#<id>` opens it. */
  readonly id: string
  readonly q: string
  /** Paragraphs. */
  readonly a: ReadonlyArray<string>
  readonly link?: FaqLink
  /** Shown in the homepage's short list. */
  readonly home?: true
}

export type FaqGroup = {
  readonly id: string
  readonly title: string
  readonly line: string
  readonly items: ReadonlyArray<FaqItem>
}

export const FAQ_GROUPS: ReadonlyArray<FaqGroup> = [
  {
    id: "product",
    title: "Product",
    line: "Wat Insyte is en wat erin zit.",
    items: [
      {
        id: "verschil",
        home: true,
        q: "Hoe verschilt Insyte van Gorgias, Zendesk of Help Scout?",
        a: [
          "Dat zijn supporttools die naast je winkel staan. Insyte is de back-end waar je winkels in pluggen: bestellingen, klantenservice, leveranciers, chargebacks en automatiseringen staan op hetzelfde scherm, en Insyte werkt over alles heen, niet alleen over tickets."
        ]
      },
      {
        id: "wat-zit-erin",
        q: "Wat zit er in Insyte?",
        a: [
          "Start, met de zaken die vandaag op je wachten. Daarnaast bestellingen, klanten, producten, klantenservice (tickets, inbox en chats), chargebacks, leveranciers, affiliates, automatiseringen, analyse en Vraag Insyte, plus een marketplace met koppelingen.",
          "Leveranciers en partners werken elk in een eigen portaal, met alleen hun eigen deel."
        ]
      },
      {
        id: "shopify",
        home: true,
        q: "Werkt het met mijn Shopify-winkel?",
        a: [
          "Ja. Shopify koppelt via OAuth, en Insyte leest bestellingen, klanten, producten en afhandelingen. Meerdere winkels kunnen in één werkruimte."
        ]
      },
      {
        id: "meerdere-winkels",
        q: "Kan ik meerdere winkels in één werkruimte beheren?",
        a: [
          "Ja. Je koppelt elke winkel apart; daarna staan bestellingen, klanten en tickets van alle winkels in één lijst, met de winkel erbij. Een rol kan worden beperkt tot bepaalde winkels, zodat een collega alleen ziet waar hij aan werkt."
        ]
      },
      {
        id: "taal",
        home: true,
        q: "In welke taal werkt Insyte?",
        a: ["In het Nederlands. Engels komt later als tweede taal."]
      },
      {
        id: "technisch",
        q: "Moet ik technisch zijn om automatiseringen te maken?",
        a: [
          "Nee. Je beschrijft in gewone taal wat er moet gebeuren; Insyte zet de stappen neer met de diensten die je al hebt. Je test een flow met een voorbeeldbestelling voordat hij live gaat, en elke versie en uitvoering wordt bewaard."
        ]
      },
      {
        id: "mobiel",
        q: "Is er een app voor mijn telefoon?",
        a: ["Nu niet. Insyte werkt in de browser. Of er een app komt, is nog niet besloten."]
      }
    ]
  },
  {
    id: "ai-en-vertrouwen",
    title: "AI en vertrouwen",
    line: "Een agent die werkt binnen jouw regels.",
    items: [
      {
        id: "ai",
        home: true,
        q: "Wat doet de AI eigenlijk?",
        a: [
          "De Insyte-agent doet het werk rond je winkel: hij leest bestellingen, tickets en geschillen, schrijft conceptantwoorden, verzamelt bewijspakketten en zet automatiseringen op. Wat geld of klanten raakt, legt hij eerst aan je voor als voorstel; jij verstuurt, past aan of negeert.",
          "Binnenkort kies je per soort actie hoe ver hij gaat: Zelf doen, Eerst vragen of Nooit."
        ]
      },
      {
        id: "zonder-mij",
        q: "Doet Insyte ooit iets zonder mij?",
        a: [
          "Nu niet. Een concept, een terugbetaling of een bewijspakket blijft een voorstel tot iemand op Versturen of Indienen drukt.",
          "Binnenkort mag de agent zelf handelen waar jij dat toestaat. Standaard doet hij alleen intern werk zelf, zoals een status zetten, een ticket toewijzen of een notitie toevoegen. Terugbetalen, annuleren en klanten of leveranciers mailen staan op Eerst vragen. Wat niet terug kan, zoals bewijs indienen bij Klarna, vraagt altijd. Een maandlimiet voor de werkruimte en per persoon houdt de kosten binnen de perken, met een melding bij 80%."
        ]
      },
      {
        id: "terugdraaien",
        q: "Kan ik terugdraaien wat de agent deed?",
        a: [
          "Ja, alles wat terug kan. Elke actie van de agent komt in een logboek, met wat hij las, waarom hij het deed en onder welke instelling. Zolang het venster open staat, staat er Ongedaan maken bij; een bericht naar buiten wacht dat venster af voordat het vertrekt.",
          "Het logboek staat gepland, net als de instellingen per actie. Ongedaan maken bij wat je zelf doet, werkt nu al."
        ]
      },
      {
        id: "klantagent",
        q: "Beantwoordt Insyte mijn klanten?",
        a: [
          "Dat staat gepland. Een klantagent op de chat van je winkel beantwoordt vragen uit een kennisbank die jij schrijft, binnen de openingstijden die jij instelt. Twijfelt hij, vraagt de klant om een mens of gaat het om geld, dan draagt hij het gesprek over aan je inbox, met een samenvatting. Terugbetalen of annuleren doet hij nooit zelf."
        ]
      },
      {
        id: "agent-ready",
        q: "Werkt Insyte met mijn eigen AI-tools?",
        a: [
          "Insyte is gebouwd voor agents. Met API-sleutels met scopes en ondertekende webhooks lezen en werken je eigen tools nu al in Insyte.",
          "Een MCP-server komt binnenkort. Dan gebruikt een AI-tool die MCP spreekt Insyte rechtstreeks, met dezelfde rechten als een API-sleutel, en komt elke actie in het auditlog."
        ]
      },
      {
        id: "bronnen",
        q: "Waar baseert Insyte een voorstel op?",
        a: [
          "Op de records in je werkruimte: de bestelling, het ticket, de track & trace, eerdere berichten. Bij elk voorstel staat wat Insyte las, en elk getal in een analyse heeft een bron die je kunt openen."
        ]
      },
      {
        id: "negeren",
        q: "Wat als Insyte iets voorstelt wat ik niet wil?",
        a: [
          "Dan negeer je het, of je past het aan. Negeren is een gewone uitkomst, geen fout. Een concept kun je ook anders laten formuleren voordat je het verstuurt."
        ]
      },
      {
        id: "training",
        q: "Wordt mijn data gebruikt om AI-modellen te trainen?",
        a: [
          "Nee. Insyte gebruikt de modellen van Anthropic via de API, en onder die voorwaarden wordt invoer niet gebruikt om modellen te trainen.",
          "Een prompt bevat alleen wat de taak nodig heeft: het gesprek, de voornaam van de klant en de feiten van de bestelling. Betaalgegevens heeft Insyte niet."
        ]
      }
    ]
  },
  {
    id: "koppelingen",
    title: "Koppelingen",
    line: "De diensten die je al gebruikt.",
    items: [
      {
        id: "welke-koppelingen",
        q: "Met welke diensten koppelt Insyte?",
        a: [
          "Shopify voor je winkels; Gmail en Outlook voor e-mail; Stripe, Klarna en PayPal voor betalingen en geschillen; AfterShip voor tracking; Klaviyo voor marketing; Slack voor je team, en Zapier voor de rest.",
          "DHL, PostNL, Sendcloud, Exact Online, Microsoft Teams, Google Sheets en andere staan gepland; in de console staan ze als binnenkort."
        ],
        link: { label: "Alle koppelingen", path: "/koppelingen" }
      },
      {
        id: "email",
        q: "Hoe komt mijn e-mail in Insyte?",
        a: [
          "Je koppelt een Gmail- of Outlook-mailbox. De gesprekken komen in de gedeelde inbox, gegroepeerd per mailbox, en je wijst ze toe aan een collega. Onder elk ticket staat een concept."
        ]
      },
      {
        id: "geschillen",
        q: "Van welke betaalproviders haalt Insyte chargebacks op?",
        a: [
          "Van Stripe, Klarna en PayPal. Per geschil verzamelt Insyte het bewijs en zet het pakket klaar, ruim voor de deadline van de provider. Indienen doe jij."
        ]
      },
      {
        id: "api",
        q: "Is er een API?",
        a: [
          "Ja. API-sleutels hebben scopes en kunnen worden beperkt tot winkels en IP-adressen. Webhooks worden ondertekend en hebben een bezorglog."
        ],
        link: { label: "Beveiliging", path: "/beveiliging" }
      },
      {
        id: "ontbreekt",
        q: "Mijn dienst staat er niet bij. Wat nu?",
        a: [
          "Zapier verbindt Insyte met wat er niet rechtstreeks in zit, en de API en webhooks staan open voor je eigen koppelingen. Laat in je aanvraag weten wat je mist."
        ]
      }
    ]
  },
  {
    id: "prijzen-en-beta",
    title: "Prijzen en bèta",
    line: "Wat het kost en hoe je binnenkomt.",
    items: [
      {
        id: "aanmelden",
        home: true,
        q: "Kan ik me gewoon aanmelden?",
        a: [
          "Nog niet. Insyte is in private bèta en werkt op uitnodiging. Vraag toegang aan; heb je al een account, log dan in."
        ]
      },
      {
        id: "aanvraag",
        q: "Hoe verloopt een toegangsaanvraag?",
        a: [
          "Je vraagt toegang aan met Google of met je werkmail en vertelt kort over je winkels. Je krijgt bericht zodra er plek is. Een creditcard is daarvoor niet nodig."
        ]
      },
      {
        id: "kosten",
        home: true,
        q: "Wat kost het?",
        a: ["De bedragen bij Prijzen zijn indicatief. Tijdens de bèta liggen de prijzen nog niet vast."],
        link: { label: "Prijzen", path: "/prijzen" }
      },
      {
        id: "abonnementen",
        q: "Waarin verschillen de abonnementen?",
        a: [
          "In het aantal winkels, plekken en bestellingen per maand, en in wat er voor een team bij komt: automatiseringen en portalen vanaf Growth, eigen rollen en een auditlog in Scale. Ook die verdeling is indicatief."
        ],
        link: { label: "Volledige vergelijking", path: "/prijzen" }
      },
      {
        id: "jaarlijks",
        q: "Hoe werkt jaarlijks betalen?",
        a: [
          "In de indicatieve prijzen betaal je bij jaarlijks betalen tien maanden in plaats van twaalf: twee maanden gratis."
        ]
      }
    ]
  },
  {
    id: "beveiliging-en-privacy",
    title: "Beveiliging en privacy",
    line: "Wie wat ziet, en waar je gegevens staan.",
    items: [
      {
        id: "rechten",
        q: "Kan ik bepalen wie wat ziet?",
        a: [
          "Ja. Een rol geeft per onderdeel een niveau: geen, bekijken, bewerken of beheren. Een werkruimte begint met vijf rollen (Eigenaar, Beheerder, Klantenservice, Financiën en Alleen lezen) en je maakt er eigen rollen bij.",
          "Een rol kan worden beperkt tot bepaalde winkels, en terugbetalen kan per rol een maximumbedrag hebben."
        ],
        link: { label: "Rollen en rechten", path: "/beveiliging" }
      },
      {
        id: "inloggen",
        q: "Ondersteunt Insyte tweestapsverificatie en SSO?",
        a: [
          "Tweestapsverificatie met een authenticator-app en back-upcodes, en een werkruimte kan die voor het hele team verplichten. Inloggen met Google kan voor iedereen, en je kunt Google Workspace verplichten voor gekozen domeinen.",
          "SAML en OIDC komen later."
        ]
      },
      {
        id: "auditlog",
        q: "Wordt bijgehouden wie wat deed?",
        a: [
          "Ja. Het auditlog legt terugbetalingen, ingediende bewijspakketten, wijzigingen in rollen en leden, API-sleutels en webhooks, exports en het publiceren van automatiseringen vast. Je filtert op persoon, actie en datum en exporteert het als CSV."
        ]
      },
      {
        id: "waar-data",
        q: "Waar staan mijn gegevens?",
        a: [
          "In de EU: de database, de bestanden en de achtergrondtaken draaien in EU-regio's. Een paar subverwerkers verwerken ook buiten de EU, zoals Anthropic voor de AI en Resend voor de metadata van verzonden e-mail. Ze staan op de beveiligingspagina."
        ],
        link: { label: "Subverwerkers", path: "/beveiliging" }
      },
      {
        id: "verwerker",
        q: "Is Insyte verwerker of verwerkingsverantwoordelijke?",
        a: [
          "Voor de klantgegevens uit je winkel is Insyte verwerker en ben jij de verwerkingsverantwoordelijke. Voor de accountgegevens van je team is Insyte zelf verantwoordelijke. De verwerkersovereenkomst legt dat vast; de tekst is nog een concept."
        ],
        link: { label: "Verwerkersovereenkomst", path: "/verwerkersovereenkomst" }
      },
      {
        id: "certificering",
        q: "Heeft Insyte een SOC 2- of ISO-certificering?",
        a: [
          "Nee, en Insyte belooft er ook geen. Wat er wel is, staat op de beveiligingspagina: rollen, tweestapsverificatie, het auditlog en waar je gegevens staan."
        ]
      },
      {
        id: "export",
        q: "Kan ik mijn data exporteren?",
        a: [
          "Ja. Wie het recht Exporteren heeft, downloadt bestellingen, klanten en producten als CSV. Elke export komt in het auditlog."
        ]
      }
    ]
  },
  {
    id: "leveranciers-en-partners",
    title: "Leveranciers en partners",
    line: "Twee eigen portalen, elk met alleen zijn eigen deel.",
    items: [
      {
        id: "portalen",
        home: true,
        q: "Wat zien leveranciers en affiliates?",
        a: [
          "Alleen hun eigen deel. Een leverancier ziet zijn eigen orderregels en het verzendadres, zonder de rest van je klantgegevens. Een affiliate ziet zijn eigen doorverwijzingen en uitbetalingen."
        ]
      },
      {
        id: "leveranciersportaal",
        q: "Wat doet een leverancier in zijn portaal?",
        a: [
          "Bestellingen accepteren, verzenden met vervoerder en track & trace (ook in meer dan één pakket), een probleem melden met een nieuwe overdrachtsdatum, voorraad en levertijd bijwerken, en per maand zien wat er openstaat. Alles wat hij doet, zie jij terug in de bestelling."
        ],
        link: { label: "Voor leveranciers", path: "/oplossingen/leveranciers" }
      },
      {
        id: "partnerprogramma",
        q: "Hoe werkt het partnerprogramma?",
        a: [
          "Partners melden zich aan en jij keurt goed. Een partner maakt eigen links met een bestemming, UTM-codes en een QR-code, ziet zijn verdiensten en niveau, en krijgt per maand een overzicht met de uitbetaling."
        ],
        link: { label: "Voor partners", path: "/oplossingen/partners" }
      },
      {
        id: "portalen-release",
        q: "Zitten de portalen in de eerste versie?",
        a: [
          "Ze staan in de bèta. Of ze in de eerste publieke versie zitten, is nog niet besloten."
        ]
      }
    ]
  }
]

export const FAQ_ITEMS: ReadonlyArray<FaqItem & { readonly group: string }> = FAQ_GROUPS.flatMap((g) =>
  g.items.map((i) => ({ ...i, group: g.id }))
)

/** The homepage's short list, in the order it has always had. */
export const HOME_FAQ: ReadonlyArray<FaqItem> = [
  "verschil",
  "shopify",
  "ai",
  "aanmelden",
  "portalen",
  "taal",
  "kosten"
].flatMap((id) => FAQ_ITEMS.filter((i) => i.id === id))

/** FAQPage structured data for a list of questions. */
export function faqJsonLd(items: ReadonlyArray<FaqItem>): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({
      "@type": "Question",
      name: i.q,
      acceptedAnswer: { "@type": "Answer", text: i.a.join(" ") }
    }))
  })
}

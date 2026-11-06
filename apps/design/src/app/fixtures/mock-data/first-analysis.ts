import type { FirstAnalysisSeed } from "@insyte/ui/data-source"
import { byScenario } from "../scenario"

/*
 * The first analysis (PLAN 45). First day: a store three weeks old with 14 orders, so Insyte does
 * not judge; it reads the setup, asks, and watches. A normal Tuesday and the busy week: 90 days of
 * history, and one finding in it — a third of the mail is "where is my order", because US delivery
 * runs past what the product pages promise. The evidence and the effect are worked out from the
 * same figures: 71% of 412 is 292.
 */

const PREPARED: FirstAnalysisSeed["prepared"] = {
  automation: {
    title: "Levertijd-update op dag 5",
    does: "Op dag 5 de trackinglink en de verwachte datum naar de klant."
  },
  agent: {
    title: "Antwoorden op statusvragen",
    does: "Schrijft het antwoord met de actuele status, jij keurt het goed."
  },
  sheet: {
    title: "Levertijd per land",
    does: "Wat je belooft naast wat het werkelijk duurt, per land."
  }
}

const READS = [
  "Bestellingen en verzendingen",
  "Klantmails in de inbox",
  "Productpagina's en wat ze beloven",
  "Verzend- en retourbeleid"
]

export const firstAnalysisSeed: FirstAnalysisSeed = byScenario<FirstAnalysisSeed>({
  empty: {
    store: { products: 36, customers: 11, orders: 14, mails: 9, days: 19 },
    reads: READS,
    early: {
      predictions: [
        {
          read: "7 tot 12 werkdagen levertijd",
          expect:
            "Bij levertijden boven een week worden vragen over de status meestal de grootste stroom mail. Een update voordat de klant gaat vragen staat klaar.",
          prepares: "automation"
        },
        {
          read: "Klarna als betaalmethode",
          expect:
            "Een Klarna-geschil heeft een vaste reactietermijn. Insyte zet bewijs per bestelling klaar zodra er een binnenkomt, zodat je die termijn haalt."
        },
        {
          read: "Retourbeleid zonder regel voor beschadigde artikelen",
          expect: "Een klacht over schade valt nu tussen wal en schip. Insyte vraagt je bij de eerste om een regel."
        }
      ],
      watch: [
        { label: "Levertijd per land", then: "dan zie je waar je belofte niet klopt", have: 6, need: 30 },
        { label: "Vragen per product", then: "dan weet Insyte welke pagina antwoord mist", have: 9, need: 50 },
        { label: "Retourredenen", then: "dan zie je welk product terugkomt en waarom", have: 0, need: 10 }
      ]
    },
    prepared: PREPARED
  },
  settled: {
    store: { products: 248, customers: 1912, orders: 3406, mails: 1288, days: 90 },
    reads: READS,
    finding: {
      headline: "Een derde van je klantmail is “waar is mijn bestelling?”.",
      evidence: [
        { figure: "412 van 1.288", says: "mails in 90 dagen gaan over de status van een bestelling", basis: "Inbox, laatste 90 dagen" },
        { figure: "9,4 dagen", says: "duurt een bestelling naar de VS, je productpagina's beloven 5 tot 7", basis: "238 bezorgde zendingen naar de VS" },
        { figure: "71%", says: "van die mails komt binnen op dag 6 tot 10, voordat het pakket er is", basis: "Moment van de mail naast de bezorgdatum" }
      ],
      fix: {
        title: "Laat de klant niet wachten tot hij gaat vragen.",
        why:
          "Stuur op dag 5 zelf de trackinglink en de verwachte datum. Dit is de vaste aanpak bij levertijden boven een week: de meeste van deze mails vragen niets anders."
      },
      effect: { figure: "~290 mails minder per kwartaal", basis: "71% van 412, als die klanten de update op tijd krijgen" }
    },
    prepared: PREPARED
  },
  busy: () => ({
    store: { products: 1124, customers: 18_240, orders: 31_870, mails: 11_406, days: 90 },
    reads: READS,
    finding: {
      headline: "Een derde van je klantmail is “waar is mijn bestelling?”.",
      evidence: [
        { figure: "3.902 van 11.406", says: "mails in 90 dagen gaan over de status van een bestelling", basis: "Inbox, laatste 90 dagen, drie winkels" },
        { figure: "10,1 dagen", says: "duurt een bestelling naar de VS, je productpagina's beloven 5 tot 7", basis: "2.114 bezorgde zendingen naar de VS" },
        { figure: "68%", says: "van die mails komt binnen op dag 6 tot 10, voordat het pakket er is", basis: "Moment van de mail naast de bezorgdatum" }
      ],
      fix: {
        title: "Laat de klant niet wachten tot hij gaat vragen.",
        why:
          "Stuur op dag 5 zelf de trackinglink en de verwachte datum. Dit is de vaste aanpak bij levertijden boven een week: de meeste van deze mails vragen niets anders."
      },
      effect: { figure: "~2.650 mails minder per kwartaal", basis: "68% van 3.902, als die klanten de update op tijd krijgen" }
    },
    prepared: PREPARED
  })
})

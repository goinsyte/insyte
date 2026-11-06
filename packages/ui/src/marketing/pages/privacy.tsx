import type { MarketingLinks } from "../links.tsx"
import {
  Bullets,
  Callout,
  Concept,
  ContactEmail,
  L,
  LegalPage,
  LegalSection,
  type LegalSectionDef,
  LegalTable,
  Para,
  Term
} from "./legal.tsx"

/* Ported from the legacy site (`apps/web/src/routes/privacy.tsx`), its Dutch text as written. */

const SECTIONS: ReadonlyArray<LegalSectionDef> = [
  { n: "01", id: "intro", title: "Korte versie" },
  { n: "02", id: "controller", title: "Verwerkingsverantwoordelijke" },
  { n: "03", id: "data", title: "Welke gegevens" },
  { n: "04", id: "purposes", title: "Doel en grondslag" },
  { n: "05", id: "retention", title: "Bewaartermijnen" },
  { n: "06", id: "ai", title: "AI en geautomatiseerde besluiten" },
  { n: "07", id: "cookies", title: "Cookies en telemetrie" },
  { n: "08", id: "sharing", title: "Met wie we delen" },
  { n: "09", id: "transfers", title: "Doorgifte buiten de EER" },
  { n: "10", id: "rights", title: "Jouw rechten" },
  { n: "11", id: "security", title: "Beveiliging" },
  { n: "12", id: "minors", title: "Minderjarigen" },
  { n: "13", id: "changes", title: "Wijzigingen" },
  { n: "14", id: "contact", title: "Contact" }
]

export function PrivacyPage({ links }: { readonly links: MarketingLinks }) {
  return (
    <LegalPage
      links={links}
      doc="privacy"
      title="Privacyverklaring."
      lede="Insyte verwerkt persoonsgegevens van operators, hun teamleden, en, namens operators, van hun eindklanten. Hier staat welke gegevens, waarom, hoe lang en wat je rechten zijn. Geen vakjargon waar het niet nodig is."
      updated="31 oktober 2026"
      updatedIso="2026-10-31"
      sections={SECTIONS}
    >
      <LegalSection
        id="intro"
        n="01"
        title="Korte versie"
        intro="De juridische versie staat verder in dit document. Voor het overzicht: dit is wat je echt moet weten."
      >
        <Bullets
          items={[
            <>
              Voor jouw accountgegevens is Insyte zelf{" "}
              <Term>verwerkingsverantwoordelijke</Term>. Voor de klantgegevens die via jouw winkel binnenkomen, is
              Insyte <Term>verwerker</Term>
              {"; "}jij bent dan verantwoordelijk.
            </>,
            <>
              Wij gebruiken je gegevens om de dienst te leveren, te beveiligen en te factureren. We verkopen niets door
              en trainen geen generieke AI-modellen op jouw gegevens.
            </>,
            <>
              Subverwerkers (zoals onze hosting in Frankfurt, e-mail­ infrastructuur en AI-aanbieders) staan met naam
              genoemd in bijlage A van de{" "}
              <L to="/verwerkersovereenkomst">
                verwerkersovereenkomst
              </L>
              .
            </>,
            <>
              Vragen, inzage of verwijdering: stuur ons een bericht via <ContactEmail name="privacy" />
              . We reageren binnen 30 dagen.
            </>
          ]}
        />
      </LegalSection>

      <LegalSection
        id="controller"
        n="02"
        title="Verwerkings­verantwoordelijke"
        intro="Voor elke gegevenscategorie staat hieronder vast wie wat is. Het onderscheid bepaalt jouw rechten."
      >
        <Concept>
          De rechtsvorm, het KvK-nummer en het adres van Insyte liggen nog niet vast. Waar hieronder Insyte B.V. of een
          adres staat, is dat een plaatshouder.
        </Concept>
        <Para>
          Voor de gegevens die je zelf bij Insyte registreert (naam, e-mail, bedrijfsgegevens, factuurgegevens,
          inlogactiviteit) is Insyte B.V. de verwerkings­verantwoordelijke in de zin van artikel 4 lid 7 AVG.
        </Para>
        <Para>
          Voor de Klantgegevens die via jouw gekoppelde winkels in Insyte komen, ben jij als operator de
          verwerkings­verantwoordelijke. Insyte handelt dan in jouw opdracht als verwerker. De afspraken daarvoor staan
          in de{" "}
          <L to="/verwerkersovereenkomst">
            verwerkersovereenkomst
          </L>
          , die automatisch onderdeel wordt van onze relatie zodra je een winkel koppelt.
        </Para>
      </LegalSection>

      <LegalSection
        id="data"
        n="03"
        title="Welke gegevens"
        intro="De volgende categorieën persoonsgegevens kunnen door of namens jou bij Insyte terechtkomen."
      >
        <LegalTable
          headers={["Categorie", "Voorbeeld", "Bron"]}
          rows={[
            [
              "Account",
              "Naam, e-mail, telefoon, bedrijfsnaam, KVK, btw-nummer.",
              "Door jou ingevoerd bij registratie of in instellingen."
            ],
            [
              "Inlog en sessie",
              "Hash van wachtwoord, 2FA-token, sessie-cookie, IP-adres, user-agent.",
              "Automatisch gegenereerd bij inloggen."
            ],
            [
              "Factuur",
              "Factuuradres, betaalmethode-token, factuurregels, btw-stand.",
              "Door jou en door onze betaalprovider Stripe."
            ],
            [
              "Productgebruik",
              "Bezochte routes, klikgedrag, latentie, foutgebeurtenissen.",
              "Automatisch gegenereerd bij gebruik van de dienst."
            ],
            [
              "Klantgegevens",
              "Naam, e-mail, telefoon, adres, ordergeschiedenis, ticket­berichten van eindklanten.",
              "Vanuit gekoppelde winkels (Shopify, e-mail, chat)."
            ],
            [
              "Communicatie",
              "E-mails, chatberichten, AI-concepten, automatiserings­regels.",
              "Vanuit jou, je teamleden of je eindklanten."
            ]
          ]}
        />
      </LegalSection>

      <LegalSection
        id="purposes"
        n="04"
        title="Doel en grondslag"
        intro="Voor iedere verwerking is er een doel en een grondslag uit artikel 6 AVG."
      >
        <LegalTable
          headers={["Doel", "Grondslag", "Voorbeeld"]}
          rows={[
            [
              "Levering van de dienst",
              "Uitvoering van de overeenkomst (art. 6 lid 1 sub b).",
              "Inloggen, orders tonen, tickets routeren."
            ],
            [
              "Facturatie en debiteurenbeheer",
              "Uitvoering van de overeenkomst en wettelijke verplichting (art. 6 lid 1 sub b en c).",
              "Factuur sturen, btw aangeven, aanmaning verzenden."
            ],
            [
              "Beveiliging en fraudepreventie",
              "Gerechtvaardigd belang (art. 6 lid 1 sub f).",
              "Inlogpogingen monitoren, accountmisbruik detecteren."
            ],
            [
              "Productverbetering",
              "Gerechtvaardigd belang (art. 6 lid 1 sub f).",
              "Geaggregeerde gebruiksstatistieken zonder herleidbare inhoud."
            ],
            [
              "Klantcommunicatie over de dienst",
              "Gerechtvaardigd belang (art. 6 lid 1 sub f) en, waar vereist, toestemming (art. 6 lid 1 sub a).",
              "Storingsmelding, beveiligingsupdate, productnieuwsbrief (opt-in)."
            ],
            [
              "Wettelijke bewaarplicht",
              "Wettelijke verplichting (art. 6 lid 1 sub c).",
              "7 jaar bewaartermijn voor facturatie volgens art. 52 lid 4 AWR."
            ]
          ]}
        />
      </LegalSection>

      <LegalSection
        id="retention"
        n="05"
        title="Bewaartermijnen"
        intro="Hoe lang we gegevens bewaren, hangt af van de categorie. Korter waar het kan, langer waar het moet. De termijnen volgen hoe Insyte is ontworpen."
      >
        <LegalTable
          headers={["Gegeven", "Bewaartermijn", "Reden"]}
          rows={[
            [
              "Gegevens van een ontkoppelde winkel",
              "De bewaartermijn van de werkruimte (30, 90 of 180 dagen), daarna verwijderd; bij een verwijderverzoek via Shopify meteen.",
              "Operationeel nodig; daarna niet meer."
            ],
            [
              "Een opgezegde werkruimte",
              "30 dagen leesbaar zodat je kunt exporteren, daarna verwijderd. Back-ups verlopen binnen 30 dagen.",
              "Herstel en export."
            ],
            [
              "E-mails en bijlagen",
              "Zolang de mailbox gekoppeld is, plus de bewaartermijn van de werkruimte.",
              "De dienst leveren."
            ],
            ["Meldingen", "180 dagen.", "De dienst leveren."],
            ["Webhookleveringen en API-logs", "30 dagen.", "Foutopsporing."],
            [
              "Auditlog",
              "13 maanden online, daarna 6 jaar gearchiveerd voor financiële handelingen.",
              "Beveiliging en verantwoording."
            ],
            [
              "Metadata van AI-aanroepen",
              "13 maanden. Geen prompt- of antwoordtekst buiten de concepten en voorstellen zelf.",
              "Kosten en kwaliteit."
            ],
            ["Factuurgegevens", "7 jaar.", "Wettelijke bewaarplicht (art. 52 lid 4 AWR)."],
            ["Aanvragen via de website", "12 maanden.", "Opvolging van je aanvraag."],
            [
              "Klantgegevens (operator als verwerker)",
              "Conform de instructies van de operator.",
              "De operator is verantwoordelijk."
            ]
          ]}
        />
      </LegalSection>

      <LegalSection
        id="ai"
        n="06"
        title="AI en geautomatiseerde besluiten"
        intro="Insyte AI is het hulpmiddel dat het hardst werkt en dat de meeste vragen oproept. Hier staan de regels."
      >
        <Para>
          Insyte gebruikt AI-modellen om klantantwoorden te ontwerpen, automatiseringen voor te stellen en
          chargeback-bewijs samen te stellen. Bij elke AI-aanroep gaan de prompt en de bijbehorende context naar een
          door ons gekozen aanbieder en blijven daar alleen voor de duur van de aanroep. Wij geven de aanbieder
          contractueel geen recht om je gegevens te bewaren of voor eigen training te gebruiken.
        </Para>
        <Para>
          Concepten worden nooit zelfstandig verzonden; een mens bevestigt elk bericht. Daardoor is er geen sprake van
          een geautomatiseerd besluit met juridisch gevolg in de zin van artikel 22 AVG.
        </Para>
        <Callout tone="info" title="Welke modellen we gebruiken">
          De actuele lijst van AI-subverwerkers, het verwerkingsgebied en de bewaartermijn per aanbieder staat in
          bijlage A van de{" "}
          <L to="/verwerkersovereenkomst">
            verwerkersovereenkomst
          </L>
          . Wijzigingen kondigen wij 30 dagen vooraf aan.
        </Callout>
      </LegalSection>

      <LegalSection
        id="cookies"
        n="07"
        title="Cookies en telemetrie"
        intro="We gebruiken zo min mogelijk cookies en alleen waar ze functioneel of veiligheidsrelevant zijn."
      >
        <Concept>
          De cookienamen en termijnen hieronder komen van de vorige site en zijn nog niet vastgesteld voor de huidige
          console.
        </Concept>
        <LegalTable
          headers={["Cookie", "Type", "Bewaartermijn"]}
          rows={[
            [
              "insyte_session",
              "Strikt noodzakelijk, sessiebeheer.",
              "30 dagen vanaf laatste activiteit."
            ],
            ["insyte_csrf", "Strikt noodzakelijk, beveiliging.", "Sessie."],
            [
              "insyte_persona",
              "Functioneel, onthoud­t welke rol je laatst koos.",
              "180 dagen."
            ],
            [
              "insyte_telemetry",
              "Statistiek (opt-out beschikbaar).",
              "12 maanden."
            ]
          ]}
        />
        <Para>
          Wij plaatsen geen advertentie- of profilering-cookies van derden in de operator-omgeving. Deze website plaatst
          geen cookies voor analyse of advertenties; hij onthoudt alleen in je eigen browser of je de bètamelding hebt
          gesloten.
        </Para>
      </LegalSection>

      <LegalSection
        id="sharing"
        n="08"
        title="Met wie we delen"
        intro="Wij delen persoonsgegevens uitsluitend met partijen die nodig zijn om de dienst te leveren, en alleen op basis van een verwerkersovereenkomst."
      >
        <Bullets
          items={[
            "Hostingpartner: voor de infrastructuur die Insyte draait, in een EU-datacenter.",
            "Betaalprovider: voor verwerking van facturen en automatische incasso.",
            "E-mailprovider: voor uitgaande operationele e-mail, voor zover je die niet via je eigen mailbox routeert.",
            "AI-aanbieders: voor de inferentie achter Insyte AI, met expliciet verbod op training en bewaring.",
            "Logging- en observatieaanbieders: voor foutopvolging, anonimiseerd waar mogelijk.",
            "Adviseurs en autoriteiten: alleen wanneer wij daartoe wettelijk verplicht zijn of bij een geschil."
          ]}
        />
        <Para>
          De volledige, actuele lijst van subverwerkers met locatie, grondslag en doel staat in bijlage A van de{" "}
          <L to="/verwerkersovereenkomst">
            verwerkersovereenkomst
          </L>
          .
        </Para>
      </LegalSection>

      <LegalSection
        id="transfers"
        n="09"
        title="Doorgifte buiten de EER"
        intro="Onze standaard is verwerking binnen de EER. Voor de gevallen waarin dat niet kan, gebruiken wij erkende waarborgen."
      >
        <Para>
          Bepaalde AI-modellen draaien op infrastructuur van aanbieders buiten de EER (met name de Verenigde Staten).
          Voor die doorgifte gebruiken wij de Standard Contractual Clauses uit Uitvoeringsbesluit (EU) 2021/914 van de
          Europese Commissie, aangevuld met aanvullende technische en organisatorische maatregelen waaronder
          versleuteling tijdens transport en rust, en contractueel verbod op secundair gebruik. Waar mogelijk selecteren
          wij EU-residentie binnen het aanbod van de aanbieder.
        </Para>
        <Para>
          Een transfer impact assessment is per subverwerker beschikbaar op verzoek via <ContactEmail name="privacy" />
          .
        </Para>
      </LegalSection>

      <LegalSection
        id="rights"
        n="10"
        title="Jouw rechten"
        intro="Onder de AVG heb je een aantal rechten. Wij hanteren één afhandeltermijn van maximaal 30 dagen, met een mogelijke verlenging van 60 dagen bij complexe verzoeken."
      >
        <Bullets
          items={[
            "Recht op inzage in welke persoonsgegevens van jou worden verwerkt.",
            "Recht op rectificatie van onjuiste of onvolledige gegevens.",
            "Recht op verwijdering, voor zover de wettelijke bewaarplicht dat toelaat.",
            "Recht op beperking van de verwerking in bepaalde gevallen.",
            "Recht op overdraagbaarheid van de gegevens die je zelf hebt verstrekt, in een gangbaar formaat.",
            "Recht van bezwaar tegen verwerkingen die gebaseerd zijn op gerechtvaardigd belang.",
            "Recht om eerder gegeven toestemming in te trekken, zonder gevolg voor verwerkingen die daarvoor plaatsvonden.",
            "Recht om een klacht in te dienen bij de Autoriteit Persoonsgegevens (autoriteitpersoonsgegevens.nl)."
          ]}
        />
        <Para>
          Verzoeken stuur je naar <ContactEmail name="privacy" />
          . Wij verifiëren je identiteit voordat wij persoonsgegevens verstrekken of verwijderen. Voor verzoeken van
          eindklanten die hun gegevens bij een operator hebben achtergelaten, sturen wij je door naar de betreffende
          operator.
        </Para>
      </LegalSection>

      <LegalSection id="security" n="11" title="Beveiliging">
        <Para>
          Versleuteling tijdens transport en in rust. Wachtwoorden worden gecontroleerd tegen een lijst van gelekte
          wachtwoorden en gehasht met scrypt. Tweestapsverificatie, door een werkruimte te verplichten voor het hele
          team. Inlogpogingen worden begrensd. Medewerkers van Insyte bereiken klantgegevens alleen met een reden per
          sessie, en elke inzage komt in het auditlog van de werkruimte. Insyte heeft geen certificeringen. Een
          uitgebreidere beschrijving staat op de{" "}
          <L to="/beveiliging">
            beveiligingspagina
          </L>
          .
        </Para>
      </LegalSection>

      <LegalSection id="minors" n="12" title="Minderjarigen">
        <Para>
          Insyte is gericht op zakelijke gebruikers en niet op kinderen. Wij verwerken bewust geen persoonsgegevens van
          personen jonger dan 16 jaar. Als wij vaststellen dat dergelijke gegevens toch zijn binnengekomen, verwijderen
          wij ze zonder vertraging.
        </Para>
      </LegalSection>

      <LegalSection id="changes" n="13" title="Wijzigingen">
        <Para>
          Wijzigingen aan deze privacyverklaring publiceren wij hier en sturen wij in samenvatting per e-mail. Materiële
          wijzigingen kondigen wij ten minste 30 dagen vooraf aan. Eerdere versies blijven raadpleegbaar op verzoek.
        </Para>
      </LegalSection>

      <LegalSection id="contact" n="14" title="Contact">
        <Para>
          Functionaris voor gegevensbescherming en privacycontact: <ContactEmail name="privacy" />
          .
        </Para>
        <Concept>Het postadres volgt zodra de bedrijfsgegevens van Insyte vastliggen.</Concept>
        <Para>
          Je hebt ook het recht een klacht in te dienen bij de Autoriteit Persoonsgegevens.
        </Para>
      </LegalSection>
    </LegalPage>
  )
}

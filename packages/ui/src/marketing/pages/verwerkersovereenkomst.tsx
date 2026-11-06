import type { MarketingLinks } from "../links.tsx"
import {
  Callout,
  Concept,
  ContactEmail,
  Defs,
  L,
  LegalPage,
  LegalSection,
  type LegalSectionDef,
  LegalTable,
  NumberedList,
  Para,
  Term
} from "./legal.tsx"

/* Ported from the legacy site (`apps/web/src/routes/dpa.tsx`), its Dutch text as written. */

const SECTIONS: ReadonlyArray<LegalSectionDef> = [
  { n: "01", id: "intro", title: "Inleiding" },
  { n: "02", id: "definitions", title: "Begrippen" },
  { n: "03", id: "scope", title: "Onderwerp en duur" },
  { n: "04", id: "instructions", title: "Verwerking op instructie" },
  { n: "05", id: "obligations", title: "Verplichtingen van Insyte" },
  { n: "06", id: "subprocessors", title: "Subverwerkers" },
  { n: "07", id: "transfers", title: "Internationale doorgifte" },
  { n: "08", id: "security", title: "Beveiligingsmaatregelen" },
  { n: "09", id: "breach", title: "Datalekken" },
  { n: "10", id: "rights", title: "Rechten van betrokkenen" },
  { n: "11", id: "audits", title: "Audits en controles" },
  { n: "12", id: "term", title: "Beëindiging en retour" },
  { n: "13", id: "liability", title: "Aansprakelijkheid" },
  { n: "14", id: "annex-a", title: "Bijlage A — subverwerkers" },
  { n: "15", id: "annex-b", title: "Bijlage B — categorieën" }
]

export function VerwerkersovereenkomstPage({ links }: { readonly links: MarketingLinks }) {
  return (
    <LegalPage
      links={links}
      doc="verwerkersovereenkomst"
      title="Verwerkersovereenkomst."
      lede="Wanneer wij persoonsgegevens van jouw klanten verwerken, doen wij dat in jouw opdracht. Deze overeenkomst legt vast welke regels we daarbij volgen, welke partijen wij inschakelen en wat we doen als er iets misgaat."
      updated="31 oktober 2026"
      updatedIso="2026-10-31"
      sections={SECTIONS}
    >
      <LegalSection
        id="intro"
        n="01"
        title="Inleiding"
        intro="Deze verwerkersovereenkomst (de DPA) is onderdeel van de overeenkomst tussen jou en Insyte B.V. en wordt automatisch van kracht zodra je een winkel of berichtenkanaal koppelt waardoor persoonsgegevens van eindklanten in Insyte verwerkt worden."
      >
        <Concept>
          De rechtsvorm, het KvK-nummer en het adres van Insyte liggen nog niet vast. Waar hieronder Insyte B.V. of een
          adres staat, is dat een plaatshouder.
        </Concept>
        <Para>
          Jij bent <Term>verwerkings­verantwoordelijke</Term>{" "}
          in de zin van artikel 4 lid 7 AVG voor de klantgegevens die via jouw winkels binnenkomen. Insyte is{" "}
          <Term>verwerker</Term>{" "}
          voor diezelfde gegevens, in de zin van artikel 4 lid 8 AVG. Voor jouw eigen accountgegevens is Insyte zelf
          verantwoordelijke; die situatie valt buiten de DPA en wordt geregeld in de{" "}
          <L to="/privacy">
            privacyverklaring
          </L>
          .
        </Para>
        <Para>
          Bij strijd tussen de hoofdovereenkomst en deze DPA geldt deze DPA voor zover het de verwerking van
          persoonsgegevens betreft.
        </Para>
      </LegalSection>

      <LegalSection
        id="definitions"
        n="02"
        title="Begrippen"
        intro="De volgende begrippen volgen de definities uit de AVG en, waar nodig, uit de hoofdovereenkomst. Zij hebben in deze DPA dezelfde betekenis."
      >
        <Defs
          items={[
            {
              term: "AVG",
              desc: "Verordening (EU) 2016/679, de Algemene Verordening Gegevensbescherming."
            },
            {
              term: "EER",
              desc: "De Europese Economische Ruimte: de EU-lidstaten plus IJsland, Liechtenstein en Noorwegen."
            },
            {
              term: "Klantgegevens",
              desc:
                "Persoonsgegevens van eindklanten van de operator die binnen de dienst worden verwerkt, zoals beschreven in bijlage B."
            },
            {
              term: "Subverwerker",
              desc:
                "Een door Insyte ingeschakelde derde die in opdracht van Insyte Klantgegevens verwerkt, zoals genoemd in bijlage A."
            },
            {
              term: "Datalek",
              desc: "Een inbreuk in verband met persoonsgegevens in de zin van artikel 4 lid 12 AVG."
            },
            {
              term: "SCC",
              desc: "Standard Contractual Clauses uit Uitvoeringsbesluit (EU) 2021/914 van de Europese Commissie."
            }
          ]}
        />
      </LegalSection>

      <LegalSection
        id="scope"
        n="03"
        title="Onderwerp en duur"
        intro="Wat we verwerken, voor welk doel, en hoe lang. De volledige opsomming van betrokkenen en gegevenscategorieën staat in bijlage B."
      >
        <Para>
          Het onderwerp van de verwerking is het leveren van de dienst Insyte aan de operator: order- en ticketbeheer,
          klant­ communicatie, leveranciersfollow-up, automatiseringen en chargeback-afhandeling. De aard van de
          verwerking is verzameling, opslag, structurering, raadpleging, gebruik, doorgifte en verwijdering.
        </Para>
        <Para>
          Deze DPA blijft van kracht zolang de hoofdovereenkomst loopt en zolang Insyte Klantgegevens onder zich heeft,
          met inbegrip van de retourperiode in artikel 12.
        </Para>
      </LegalSection>

      <LegalSection
        id="instructions"
        n="04"
        title="Verwerking op instructie"
        intro="De gedocumenteerde instructie van de operator is het uitgangspunt; daarbuiten verwerken wij niet, behalve voor zover een wet ons daartoe verplicht."
      >
        <Para>
          Insyte verwerkt Klantgegevens uitsluitend op gedocumenteerde instructie van de operator. De hoofdovereenkomst,
          deze DPA, de Documentatie en de configuratie die de operator binnen Insyte maakt (winkelkoppelingen,
          automatiseringsregels, ticketrouting) gelden als gedocumenteerde instructies.
        </Para>
        <Para>
          Indien Insyte op grond van Unierecht of het recht van een lidstaat verplicht is buiten de instructie te
          verwerken, stelt Insyte de operator daarvan vooraf in kennis, tenzij die wetgeving dat verbiedt op grond van
          zwaarwegend openbaar belang.
        </Para>
      </LegalSection>

      <LegalSection id="obligations" n="05" title="Verplichtingen van Insyte">
        <NumberedList
          items={[
            "Vertrouwelijkheid afdwingen bij iedere werknemer of contractant die toegang heeft tot Klantgegevens.",
            "Passende technische en organisatorische maatregelen treffen, zoals beschreven in artikel 8 en op de beveiligingspagina.",
            "De operator helpen bij het voldoen aan de rechten van betrokkenen, zoals beschreven in artikel 10.",
            "De operator helpen bij beveiligingsincidenten, melding van datalekken en, waar van toepassing, de bijbehorende effectbeoordeling.",
            "Op verzoek bewijs leveren van naleving, conform artikel 11.",
            "Insyte stelt de operator direct in kennis als een instructie naar het oordeel van Insyte in strijd is met de AVG of andere toepasselijke wetgeving."
          ]}
        />
      </LegalSection>

      <LegalSection
        id="subprocessors"
        n="06"
        title="Subverwerkers"
        intro="Insyte maakt gebruik van subverwerkers om de dienst te leveren. De operator geeft hierbij een algemene voorafgaande toestemming voor de inschakeling van subverwerkers, onder de voorwaarden hieronder."
      >
        <NumberedList
          items={[
            "De actuele lijst van subverwerkers staat in bijlage A, en wordt onderhouden op goinsyte.com/dpa.",
            "Insyte sluit met iedere subverwerker een schriftelijke overeenkomst met verplichtingen die ten minste gelijk zijn aan deze DPA.",
            "Wijzigingen of toevoegingen aan de lijst van subverwerkers worden ten minste 30 dagen vooraf aangekondigd per e-mail aan de beheerder en op de DPA-pagina.",
            "De operator kan binnen 30 dagen na aankondiging op redelijke gronden bezwaar maken. Bij gegrond bezwaar zal Insyte zoeken naar een alternatief; bij gebrek aan alternatief mag de operator de hoofdovereenkomst opzeggen zonder vergoeding voor de overgebleven termijn."
          ]}
        />
      </LegalSection>

      <LegalSection id="transfers" n="07" title="Internationale doorgifte">
        <Para>
          Verwerking vindt in beginsel plaats binnen de EER. Voor subverwerkers die buiten de EER verwerken, gebruikt
          Insyte de <Term>SCC</Term>{" "}
          van de Europese Commissie als doorgiftegrond, module 3 (verwerker tot subverwerker) of module 2 (verwerkings­
          verantwoordelijke tot verwerker) voor zover van toepassing.
        </Para>
        <Para>
          Aanvullende technische en organisatorische maatregelen (versleuteling tijdens transport en rust, contractueel
          verbod op secundair gebruik, minimalisatie van metadata) gelden voor iedere doorgifte. Per subverwerker is een
          transfer impact assessment beschikbaar op verzoek.
        </Para>
      </LegalSection>

      <LegalSection
        id="security"
        n="08"
        title="Beveiligingsmaatregelen"
        intro="De maatregelen zoals Insyte ze ontwerpt. Insyte heeft geen certificeringen. Een uitgebreidere beschrijving staat op de beveiligingspagina."
      >
        <LegalTable
          headers={["Categorie", "Maatregel"]}
          rows={[
            [
              "Versleuteling",
              "Versleuteling tijdens transport, en in rust in de database en de bestandsopslag. Tokens van providers en uitbetaalgegevens worden daarnaast apart verzegeld."
            ],
            [
              "Authenticatie",
              "Wachtwoorden van ten minste 8 tekens, gecontroleerd tegen een lijst van gelekte wachtwoorden en gehasht met scrypt. Tweestapsverificatie, door de werkruimte te verplichten. Inloggen met Google, met Google Workspace verplicht voor gekozen domeinen."
            ],
            [
              "Toegangsbeheer",
              "Rollen met een niveau per onderdeel, beperkt tot winkels, gecontroleerd op de server en in de database. Medewerkers van Insyte bereiken klantgegevens alleen via een interne omgeving, met een reden per sessie, en elke inzage komt in het auditlog van de werkruimte."
            ],
            [
              "Scheiding van werkruimtes",
              "Elke vraag aan de database is beperkt tot één werkruimte, met row-level security als vangnet."
            ],
            [
              "Logging",
              "Een auditlog dat alleen kan worden aangevuld, 13 maanden online en daarna 6 jaar gearchiveerd voor financiële handelingen. Logs bevatten id's, geen persoonsgegevens."
            ],
            ["Back-ups", "Back-ups verlopen binnen 30 dagen."]
          ]}
        />
      </LegalSection>

      <LegalSection
        id="breach"
        n="09"
        title="Datalekken"
        intro="Snel, feitelijk, zonder hoogdravende taal."
      >
        <Concept>De termijnen in dit artikel zijn nog niet vastgesteld.</Concept>
        <NumberedList
          items={[
            "Insyte meldt een Datalek zonder onredelijke vertraging en uiterlijk binnen 48 uur na vaststelling aan de beheerder van het getroffen account.",
            "De melding bevat de aard van het lek, de getroffen gegevenscategorieën, het geschatte aantal betrokkenen, de waarschijnlijke gevolgen, de getroffen maatregelen en het contactpunt.",
            "De operator is verantwoordelijk voor melding aan de Autoriteit Persoonsgegevens en eventueel aan betrokkenen. Insyte levert de feiten en helpt bij de inhoud van de melding.",
            "Insyte houdt een interne registratie van alle Datalekken, ongeacht of zij meldplichtig zijn."
          ]}
        />
        <Callout tone="warning" title="Meldpunt voor security">
          Een vermoeden van een Datalek of een kwetsbaarheid meld je aan <ContactEmail name="security" />
          .
        </Callout>
      </LegalSection>

      <LegalSection id="rights" n="10" title="Rechten van betrokkenen">
        <Para>
          Insyte ondersteunt de operator in de uitvoering van verzoeken van betrokkenen onder de artikelen 12 tot en met
          23 AVG. Concreet biedt Insyte exports per klant (in CSV en JSON), verwijdering per klant en, op redelijk
          verzoek, ondersteuning bij bezwaar of beperking.
        </Para>
        <Para>
          Verzoeken die rechtstreeks bij Insyte binnenkomen en niet over de eigen relatie met de operator gaan, worden
          zonder onredelijke vertraging doorgezet naar de betreffende operator. Insyte beantwoordt geen verzoeken van
          betrokkenen namens de operator, tenzij dit schriftelijk is afgesproken.
        </Para>
      </LegalSection>

      <LegalSection id="audits" n="11" title="Audits en controles">
        <Concept>
          Insyte heeft nog geen penetratietest laten uitvoeren en geen beveiligingsrapportage. Dit artikel beschrijft
          hoe het bedoeld is.
        </Concept>
        <Para>
          Insyte stelt de operator jaarlijks een actuele beveiligings­ rapportage ter beschikking, inclusief de scope en
          samenvatting van de meest recente penetratietest. Op redelijk verzoek verstrekt Insyte aanvullende
          documentatie ter onderbouwing van de naleving van deze DPA.
        </Para>
        <Para>
          De operator mag, op eigen kosten en ten hoogste eenmaal per jaar, een audit laten uitvoeren door een
          onafhankelijke en aan beide partijen aanvaardbare derde. De audit wordt ten minste 30 dagen vooraf
          aangekondigd, vindt plaats tijdens kantooruren en verstoort niet de bedrijfsvoering van Insyte. Bij
          vaststelling van een tekortkoming pakt Insyte deze direct op.
        </Para>
      </LegalSection>

      <LegalSection id="term" n="12" title="Beëindiging en retour">
        <NumberedList
          items={[
            "Na beëindiging van de hoofdovereenkomst stelt Insyte op verzoek van de operator alle Klantgegevens beschikbaar in CSV of JSON, voor een periode van maximaal 30 dagen na beëindiging.",
            "Na afloop van die periode verwijdert Insyte de Klantgegevens uit alle actieve systemen; back-ups verlopen binnen 30 dagen, behoudens wettelijke bewaarplichten.",
            "Op verzoek verstrekt Insyte een schriftelijke bevestiging van de verwijdering."
          ]}
        />
      </LegalSection>

      <LegalSection id="liability" n="13" title="Aansprakelijkheid">
        <Para>
          Aansprakelijkheid voor schade die voortvloeit uit deze DPA wordt beheerst door de aansprakelijkheidsbepalingen
          in de{" "}
          <L to="/voorwaarden">
            voorwaarden
          </L>
          , voor zover van toepassing. De aansprakelijkheidsbeperkingen gelden niet bij opzet of bewuste roekeloosheid
          van Insyte of haar leidinggevenden.
        </Para>
      </LegalSection>

      <LegalSection
        id="annex-a"
        n="14"
        title="Bijlage A — subverwerkers"
        intro="De subverwerkers waarmee Insyte is ontworpen. Wijzigingen worden aangekondigd zoals beschreven in artikel 6."
      >
        <LegalTable
          headers={["Aanbieder", "Dienst", "Locatie", "Grondslag"]}
          rows={[
            ["Neon", "Database", "EU (Frankfurt)", "Binnen de EER"],
            [
              "Cloudflare",
              "Hosting, opslag, achtergrondtaken, netwerk",
              "Opslag en taken in de EU; verwerking aan de rand wereldwijd",
              "SCC voor verwerking buiten de EER"
            ],
            [
              "Anthropic",
              "AI: concepten, voorstellen en antwoorden",
              "Buiten de EER; EU-verwerking waar die wordt aangeboden",
              "SCC; geen training op invoer"
            ],
            ["Resend", "E-mail versturen", "Verzending in de EU; metadata en logs in de VS", "SCC"],
            [
              "Stripe",
              "Facturatie, betalingen en geschillen",
              "Volgens het account bij Stripe",
              "Volgens de voorwaarden van Stripe"
            ],
            [
              "Google en Microsoft",
              "Inloggen en e-mail via de eigen accounts van de operator",
              "Volgens die accounts",
              "Volgens de voorwaarden van de aanbieder"
            ]
          ]}
        />
      </LegalSection>

      <LegalSection
        id="annex-b"
        n="15"
        title="Bijlage B — gegevenscategorieën"
        intro="De volgende categorieën van betrokkenen en gegevens worden binnen Insyte verwerkt namens de operator."
      >
        <LegalTable
          headers={["Categorie betrokkene", "Gegevenscategorieën", "Duur"]}
          rows={[
            [
              "Eindklanten van de operator",
              "Identificatie (naam, e-mail, telefoon), adresgegevens, ordergeschiedenis, betaalreferentie, communicatie en ticketinhoud.",
              "Duur van de hoofdovereenkomst plus retourperiode."
            ],
            [
              "Bezoekers van klantkanalen",
              "IP-adres, user-agent, klikgeschiedenis binnen tickets of inbox.",
              "Volgens de bewaartermijnen in de privacyverklaring."
            ],
            [
              "Leveranciers en contactpersonen",
              "Naam, e-mail, telefoon, KVK, leveringsadres.",
              "Duur van de hoofdovereenkomst plus retourperiode."
            ],
            [
              "Affiliates",
              "Naam, e-mail, betaalgegevens, kliks en conversies.",
              "Duur van de hoofdovereenkomst plus retourperiode."
            ]
          ]}
        />
        <Para>
          Bijzondere categorieën van persoonsgegevens in de zin van artikel 9 AVG worden niet bewust verwerkt en horen
          niet in Insyte thuis. Operators wordt aangeraden geen gevoelige gegevens (zoals gezondheidsgegevens of
          strafrechtelijke gegevens) op te slaan in vrije tekstvelden.
        </Para>
      </LegalSection>
    </LegalPage>
  )
}

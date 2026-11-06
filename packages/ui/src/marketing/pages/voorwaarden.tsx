import type { MarketingLinks } from "../links.tsx"
import {
  Bullets,
  Callout,
  Concept,
  ContactEmail,
  Defs,
  L,
  LegalPage,
  LegalSection,
  type LegalSectionDef,
  LegalSub,
  LegalTable,
  NumberedList,
  Para,
  Term
} from "./legal.tsx"

/* Ported from the legacy site (`apps/web/src/routes/voorwaarden.tsx`), its Dutch text as written. */

const SECTIONS: ReadonlyArray<LegalSectionDef> = [
  { n: "01", id: "intro", title: "Wie en wat" },
  { n: "02", id: "definitions", title: "Begrippen" },
  { n: "03", id: "account", title: "Account en toegang" },
  { n: "04", id: "service", title: "Onze dienst" },
  { n: "05", id: "your-content", title: "Jouw gegevens en winkels" },
  { n: "06", id: "ai", title: "AI-functies" },
  { n: "07", id: "fair-use", title: "Acceptabel gebruik" },
  { n: "08", id: "fees", title: "Tarieven en betaling" },
  { n: "09", id: "trial", title: "Proefperiode en opzegging" },
  { n: "10", id: "availability", title: "Beschikbaarheid en onderhoud" },
  { n: "11", id: "ip", title: "Intellectueel eigendom" },
  { n: "12", id: "warranties", title: "Garanties en disclaimers" },
  { n: "13", id: "liability", title: "Aansprakelijkheid" },
  { n: "14", id: "indemnity", title: "Vrijwaring" },
  { n: "15", id: "term", title: "Duur en beëindiging" },
  { n: "16", id: "changes", title: "Wijzigingen aan deze voorwaarden" },
  { n: "17", id: "law", title: "Toepasselijk recht" },
  { n: "18", id: "contact", title: "Contact" }
]

export function VoorwaardenPage({ links }: { readonly links: MarketingLinks }) {
  return (
    <LegalPage
      links={links}
      doc="voorwaarden"
      title="Voorwaarden voor het gebruik van Insyte."
      lede="Het korte verhaal: je mag Insyte gebruiken om je winkel te runnen, jij blijft eigenaar van je gegevens, wij rekenen een vast tarief per maand, en we doen ons werk met de zorg die hoort bij geld en klantvertrouwen. Dit document is de lange versie."
      updated="31 oktober 2026"
      updatedIso="2026-10-31"
      sections={SECTIONS}
    >
      <LegalSection
        id="intro"
        n="01"
        title="Wie en wat"
        intro="Dit zijn de voorwaarden tussen Insyte B.V. en de operator die een account aanmaakt. Lees ze één keer goed; daarna komen ze alleen weer naar boven als er iets verandert."
      >
        <Concept>
          De rechtsvorm, het KvK-nummer en het adres van Insyte liggen nog niet vast. Waar hieronder Insyte B.V. of een
          adres staat, is dat een plaatshouder.
        </Concept>
        <Para>
          Insyte B.V. (<Term>“Insyte”</Term>,{" "}
          <Term>“wij”</Term>) is gevestigd te Amsterdam, ingeschreven bij de Kamer van Koophandel onder
          placeholder-nummer 99999999 en bereikbaar via <ContactEmail name="legal" />
          . Wij leveren een online dienst, genaamd Insyte, voor het runnen van een dropshipping- of e-commerce-operatie.
          Deze voorwaarden zijn van toepassing op iedere registratie, ieder bezoek aan de marketingomgeving en ieder
          gebruik van het product.
        </Para>
        <Para>
          Door een account aan te maken of de dienst te gebruiken geef je aan dat je deze voorwaarden hebt gelezen en
          aanvaardt. Als je namens een rechtspersoon een account aanmaakt, garandeer je dat je bevoegd bent die
          rechtspersoon te binden.
        </Para>
        <Callout tone="info" title="Geen consumentenrechten">
          Insyte is een zakelijke dienst, bedoeld voor handelaars en operators. De bepalingen van afdeling 6.5.2A en
          titel 7.1a van het Burgerlijk Wetboek over koop op afstand en consumentenrechten zijn niet van toepassing.
        </Callout>
      </LegalSection>

      <LegalSection
        id="definitions"
        n="02"
        title="Begrippen"
        intro="De volgende termen hebben in dit document een vaste betekenis. Waar ze in andere documenten van Insyte voorkomen, hebben ze dezelfde betekenis tenzij uitdrukkelijk anders is vermeld."
      >
        <Defs
          items={[
            {
              term: "Account",
              desc: "De persoonlijke ruimte binnen Insyte waarmee jij en je teamleden toegang hebben tot de dienst."
            },
            {
              term: "Beheerder",
              desc:
                "De persoon die het account aanmaakt en facturatie, gebruikersrollen en winkelkoppelingen beheert. Per account is er één hoofd-beheerder."
            },
            {
              term: "Operator",
              desc:
                "De rechtspersoon of natuurlijke persoon namens wie het account is geopend en op wiens naam de factuur wordt gesteld."
            },
            {
              term: "Klantgegevens",
              desc:
                "Alle persoonsgegevens van eindklanten van de operator die via gekoppelde winkels of berichtenkanalen in Insyte binnenkomen."
            },
            {
              term: "Operatorgegevens",
              desc:
                "Alle overige gegevens die de operator in Insyte plaatst of die door het gebruik van de dienst ontstaan: orders, tickets, leveranciersgegevens, notities, automatiseringsregels, AI-prompts en -concepten."
            },
            {
              term: "Dienst",
              desc:
                "Het Insyte-platform, inclusief web-app, API, e-mailverwerking, AI-functies, ondersteunende infrastructuur en alle door Insyte aangeboden uitbreidingen."
            },
            {
              term: "Integratie",
              desc:
                "Een koppeling met een externe dienst zoals Shopify, Stripe, een leveranciersportaal of een e-mailprovider."
            },
            {
              term: "Documentatie",
              desc:
                "De openbare beschrijving van Insyte en de bijbehorende handleidingen, beschikbaar op goinsyte.com of binnen het product."
            }
          ]}
        />
      </LegalSection>

      <LegalSection
        id="account"
        n="03"
        title="Account en toegang"
        intro="Eén account, één hoofd-beheerder, en zoveel teamleden als je rol vereist. We houden de regels rond toegang opzettelijk strak: het account is een sleutel tot klantgeld."
      >
        <LegalSub n="3.1" title="Aanmaken en bevoegdheid">
          <Para>
            Om een account aan te maken moet je 18 jaar of ouder zijn en bevoegd om bindende overeenkomsten aan te gaan.
            Je verstrekt actuele en juiste gegevens en houdt ze actueel zolang het account bestaat.
          </Para>
        </LegalSub>
        <LegalSub n="3.2" title="Inloggegevens en beveiliging">
          <Para>
            Je bent verantwoordelijk voor het veilig bewaren van je inloggegevens en voor alle handelingen die onder
            jouw account worden verricht. Insyte biedt verplichte twee-factor­authenticatie voor de beheerder en sterk
            aanbevolen 2FA voor alle teamleden. Vermoed je misbruik, meld het binnen 24 uur via{" "}
            <ContactEmail name="security" />
            .
          </Para>
        </LegalSub>
        <LegalSub n="3.3" title="Teamleden en rollen">
          <Para>
            De beheerder kan teamleden uitnodigen en hen één van drie rollen geven: <Term>Beheerder</Term>,{" "}
            <Term>Operator</Term> of{" "}
            <Term>Bekijker</Term>. De operator is verantwoordelijk voor het handelen van zijn teamleden binnen de
            dienst, alsof het zijn eigen handelen betreft.
          </Para>
        </LegalSub>
        <LegalSub n="3.4" title="Leveranciers en affiliates">
          <Para>
            Leveranciers en affiliates die door een operator worden uitgenodigd, krijgen een beperkt eigen account dat
            alleen tot de aan hen toegewezen gegevens toegang heeft. Voor hen gelden dezelfde voorwaarden, met dien
            verstande dat zij geen zelfstandige factuurrelatie met Insyte hebben tenzij ze ook zelf een operator-account
            openen.
          </Para>
        </LegalSub>
      </LegalSection>

      <LegalSection
        id="service"
        n="04"
        title="Onze dienst"
        intro="Insyte is een commando­centrum voor dropshipping: orders, tickets, chats, leveranciersbeheer, chargebacks, automatiseringen en een marktplaats van integraties. Onderstaande beschrijving is een verkorte weergave; de volledige beschrijving leeft in de Documentatie."
      >
        <Para>
          De dienst wordt geleverd als{" "}
          <Term>Software-as-a-Service</Term>: Insyte beheert de infrastructuur, de updates en de continuïteit, en jij
          gebruikt de dienst via de browser of API. Er is geen installatie op je eigen apparatuur vereist.
        </Para>
        <Para>
          We brengen regelmatig nieuwe functies uit en sommige functies in een vroege fase worden gemarkeerd als{" "}
          <Term>Voorbeeld</Term> of{" "}
          <Term>Bèta</Term>. Voorbeeldfuncties kunnen op elk moment veranderen of worden teruggetrokken en hebben geen
          SLA totdat ze algemeen beschikbaar worden verklaard.
        </Para>
        <LegalSub n="4.1" title="Integraties">
          <Para>
            Insyte koppelt met diensten van derden, waaronder Shopify, Stripe en e-mailproviders. Voor het gebruik van
            die diensten gelden de eigen voorwaarden van die derde. Insyte is geen partij bij die overeenkomsten en is
            niet verantwoordelijk voor hun beschikbaarheid, prijswijzigingen of beëindiging.
          </Para>
        </LegalSub>
        <LegalSub n="4.2" title="Ondersteuning">
          <Concept>Hoe en wanneer ondersteuning wordt gegeven, ligt nog niet vast.</Concept>
        </LegalSub>
      </LegalSection>

      <LegalSection
        id="your-content"
        n="05"
        title="Jouw gegevens en winkels"
        intro="Alles wat je in Insyte zet of via gekoppelde winkels binnenhaalt, blijft van jou. Wij hebben alleen die rechten die nodig zijn om de dienst aan jou te leveren."
      >
        <Para>
          Je behoudt alle rechten op je Operatorgegevens en op de Klantgegevens die via jouw winkels binnenkomen. Je
          verleent Insyte een wereldwijde, niet-exclusieve, royaltyvrije licentie om die gegevens te gebruiken, op te
          slaan en te verwerken, uitsluitend om de dienst aan jou te leveren, te beveiligen en te verbeteren.
        </Para>
        <Para>
          Insyte gebruikt jouw gegevens niet om generieke modellen te trainen, deelt ze niet met andere operators en
          verkoopt ze nooit door. De volledige regels over verwerking van persoonsgegevens staan in onze{" "}
          <L to="/privacy">
            privacyverklaring
          </L>{" "}
          en in de{" "}
          <L to="/verwerkersovereenkomst">
            verwerkersovereenkomst
          </L>
          .
        </Para>
        <LegalSub n="5.1" title="Backup en export">
          <Para>
            Je kunt op elk moment een export aanvragen van je orders, tickets, klantgegevens en automatiseringsregels in
            een open formaat (CSV of JSON). Wij bewaren een gecodeerde, dagelijkse back-up van alle accountgegevens, met
            een retentie van 30 dagen.
          </Para>
        </LegalSub>
        <LegalSub n="5.2" title="Verwijdering">
          <Para>
            Na beëindiging blijft je werkruimte 30 dagen leesbaar zodat je kunt exporteren; daarna verwijderen wij je
            gegevens uit alle actieve systemen, en back-ups verlopen binnen 30 dagen, behoudens wettelijke
            bewaarplichten. Je kunt eerdere verwijdering aanvragen via <ContactEmail name="privacy" />
            .
          </Para>
        </LegalSub>
      </LegalSection>

      <LegalSection
        id="ai"
        n="06"
        title="AI-functies"
        intro="Insyte AI schrijft antwoorden, stelt automatiseringen voor en classificeert chargebacks. AI is een hulpmiddel, niet een vervanger. Hier staat hoe wij dat scherp houden."
      >
        <Para>
          Concepten die door Insyte AI worden gegenereerd worden nooit verstuurd zonder een expliciete actie van een
          mens. Elke draft moet door jou of een teamlid worden bevestigd voordat hij naar de klant gaat. Aanbevelingen
          voor chargeback-evidence en automatiseringen zijn voorstellen, geen handelingen.
        </Para>
        <Para>
          Wij gebruiken jouw operator- of klantgegevens niet om grondmodellen van derden te trainen. Wanneer een externe
          AI-aanbieder wordt ingeschakeld, worden de prompts en context alleen voor de duur van de aanroep verzonden en
          niet door die aanbieder bewaard, voor zover de aanbieder dit contractueel garandeert. De actuele lijst van
          AI-subverwerkers staat in bijlage A van de{" "}
          <L to="/verwerkersovereenkomst">
            verwerkersovereenkomst
          </L>
          .
        </Para>
        <Callout tone="warning" title="Geen juridisch of medisch advies">
          AI-uitvoer is een werkzaam concept, geen oordeel. Gebruik de concepten niet als juridisch advies, medisch
          advies, of als grondslag voor een geautomatiseerd besluit met juridisch gevolg in de zin van artikel 22 AVG
          zonder een eigen menselijke beoordeling.
        </Callout>
      </LegalSection>

      <LegalSection
        id="fair-use"
        n="07"
        title="Acceptabel gebruik"
        intro="De volgende dingen mag je niet doen met Insyte. Voor de meeste operators is dit een lege lijst; we maken hem expliciet zodat we hem kunnen handhaven wanneer dat nodig is."
      >
        <Bullets
          items={[
            "De dienst gebruiken voor verboden of frauduleuze goederen, namaakproducten, of producten die onder een handelsembargo vallen.",
            "Geautomatiseerde verzoeken sturen die buiten redelijke werklast vallen, of de API gebruiken om de dienst te scrapen, herbouwen of mirrorren.",
            "De beveiliging van de dienst omzeilen of testen zonder schriftelijke toestemming van Insyte security.",
            "De dienst beschikbaar maken voor derden buiten je teamleden, leveranciers en affiliates die binnen je account zijn uitgenodigd.",
            "Spamberichten, ongevraagde commerciële berichten of misleidende klantcommunicatie versturen via Insyte.",
            "Inhoud opslaan of versturen die in strijd is met intellectuele eigendomsrechten van derden, of die kinderen seksueel uitbuit."
          ]}
        />
        <Para>
          Als wij vermoeden dat je deze regels overtreedt, kunnen wij je account tijdelijk schorsen om de dienst en
          andere operators te beschermen. Wij melden de schorsing zo snel als redelijkerwijs mogelijk en geven je
          gelegenheid te reageren.
        </Para>
      </LegalSection>

      <LegalSection
        id="fees"
        n="08"
        title="Tarieven en betaling"
        intro="Insyte werkt met een vast maandelijks abonnement. Er zijn geen verborgen kosten per ticket, per draft, per chargeback of per leverancier."
      >
        <Concept>
          De prijzen zijn indicatief zolang de bèta loopt. De betaaltermijn en de indexering hieronder zijn nog niet
          vastgesteld.
        </Concept>
        <LegalSub n="8.1" title="Prijs">
          <Para>
            De actuele tarieven staan op <L to="/prijzen">de prijspagina</L>
            . Bij het aanmaken van je account zie je het toepasselijke tarief. Tarieven zijn in euro en exclusief btw.
          </Para>
        </LegalSub>
        <LegalSub n="8.2" title="Facturatie en betaaltermijn">
          <Para>
            Facturatie vindt vooraf plaats, per maand of per jaar, op de eerste dag van de periode. De betaaltermijn is
            14 dagen. Bij automatische incasso of kaartbetaling vindt afschrijving plaats op de factuurdatum.
          </Para>
        </LegalSub>
        <LegalSub n="8.3" title="Te late betaling">
          <Para>
            Bij overschrijding van de betaaltermijn is wettelijke handelsrente verschuldigd vanaf de vervaldag. Na een
            aanmaning en een redelijke nadere termijn kan Insyte het account opschorten. Een schorsing wegens
            wanbetaling laat geen vorderingen op reeds verleende dienst onverlet.
          </Para>
        </LegalSub>
        <LegalSub n="8.4" title="Prijswijzigingen">
          <Para>
            Insyte mag de tarieven jaarlijks per 1 januari aanpassen, met maximaal de CBS-index voor zakelijke
            dienstverlening plus drie procentpunten. Wijzigingen worden ten minste 60 dagen vooraf aangekondigd. Bij een
            wijziging boven dit kader heb je het recht het abonnement op te zeggen tegen de inwerkingtredingsdatum.
          </Para>
        </LegalSub>
      </LegalSection>

      <LegalSection id="trial" n="09" title="Proefperiode en opzegging">
        <Concept>
          Of er een proefperiode komt en hoe lang, is nog niet besloten. Tijdens de private bèta werkt Insyte op
          uitnodiging.
        </Concept>
        <Para>
          Je kunt je abonnement op elk moment opzeggen vanuit de instellingen. De opzegging gaat in aan het einde van de
          lopende betaalperiode; er is geen restitutie voor de resterende dagen binnen de periode.
        </Para>
      </LegalSection>

      <LegalSection
        id="availability"
        n="10"
        title="Beschikbaarheid en onderhoud"
      >
        <Concept>
          Insyte doet geen beloftes over beschikbaarheid en heeft geen statuspagina. Afspraken over beschikbaarheid en
          gepland onderhoud volgen voordat Insyte publiek opent.
        </Concept>
        <Para>
          Onverwacht onderhoud of een spoedherstel kan zonder voorafgaande aankondiging worden uitgevoerd indien dat
          noodzakelijk is voor de veiligheid of integriteit van de dienst.
        </Para>
      </LegalSection>

      <LegalSection id="ip" n="11" title="Intellectueel eigendom">
        <Para>
          Alle intellectuele eigendomsrechten op de dienst, de Documentatie, het merk Insyte en het ontwerp van het
          product berusten bij Insyte of bij haar licentiegevers. Je krijgt een beperkte, niet-overdraagbare licentie om
          de dienst te gebruiken binnen het kader van deze voorwaarden.
        </Para>
        <Para>
          Feedback die je ons stuurt mogen wij vrijelijk gebruiken om de dienst te verbeteren, zonder verplichting tot
          vergoeding of attributie. Je behoudt alle rechten op de inhoud die je via feedback deelt.
        </Para>
      </LegalSection>

      <LegalSection id="warranties" n="12" title="Garanties en disclaimers">
        <Para>
          Wij leveren de dienst met de zorgvuldigheid die van een professionele aanbieder verwacht mag worden. Verder
          dan dat verstrekken wij geen uitdrukkelijke of stilzwijgende garanties: de dienst wordt aangeboden{" "}
          <Term>“as is”</Term> en{" "}
          <Term>“as available”</Term>. We garanderen geen ononderbroken werking, geen foutloze AI-uitvoer en geen
          specifieke bedrijfsresultaten.
        </Para>
        <Para>
          Resultaten van rapportages, analyses, AI-concepten en chargeback-aanbevelingen zijn bedoeld als beslissings­
          ondersteuning. De operator is en blijft verantwoordelijk voor handelingen die op basis daarvan worden
          verricht.
        </Para>
      </LegalSection>

      <LegalSection
        id="liability"
        n="13"
        title="Aansprakelijkheid"
        intro="De volgende bepalingen begrenzen onze aansprakelijkheid. Zij gelden voor zover wettelijk toegestaan. Zij gelden niet bij opzet of bewuste roekeloosheid."
      >
        <Concept>De bedragen in dit artikel zijn nog niet juridisch beoordeeld.</Concept>
        <Para>
          De totale aansprakelijkheid van Insyte per kalenderjaar is beperkt tot het bedrag dat je in dat kalenderjaar
          voor de dienst aan ons hebt betaald, met een minimum van € 1.000 en een maximum van € 50.000.
        </Para>
        <Para>
          Insyte is niet aansprakelijk voor indirecte schade, gevolgschade, winstderving, gemiste besparingen,
          reputatieschade of schade veroorzaakt door storingen van derde diensten, waaronder Shopify, betaalproviders en
          e-mailproviders.
        </Para>
      </LegalSection>

      <LegalSection id="indemnity" n="14" title="Vrijwaring">
        <Para>
          Je vrijwaart Insyte tegen aanspraken van derden die voortvloeien uit jouw gebruik van de dienst, jouw
          producten, jouw klantcommun­ icatie of een schending van deze voorwaarden door jou of een teamlid.
        </Para>
        <Para>
          Insyte vrijwaart jou tegen aanspraken van derden die stellen dat de dienst zelf, gebruikt binnen het kader van
          deze voorwaarden, inbreuk maakt op hun intellectuele eigendomsrechten in de Europese Economische Ruimte, mits
          je ons direct op de hoogte stelt en de regie over de verdediging laat.
        </Para>
      </LegalSection>

      <LegalSection id="term" n="15" title="Duur en beëindiging">
        <NumberedList
          items={[
            "De overeenkomst loopt vanaf de aanmaak van het account voor onbepaalde tijd, met als minimumtermijn de gekozen betaalperiode.",
            "Beide partijen mogen de overeenkomst tegen het einde van een betaalperiode opzeggen, zonder reden.",
            "Insyte mag de overeenkomst per direct beëindigen bij ernstige overtreding van de regels onder acceptabel gebruik, bij faillissement of bij meer dan 60 dagen wanbetaling na aanmaning.",
            "Na beëindiging vervalt het gebruiksrecht en gelden de bewaartermijnen voor gegevens zoals omschreven in 5.2."
          ]}
        />
      </LegalSection>

      <LegalSection
        id="changes"
        n="16"
        title="Wijzigingen aan deze voorwaarden"
      >
        <Para>
          Wij mogen deze voorwaarden aanpassen. Materiële wijzigingen kondigen wij ten minste 30 dagen vooraf aan, per
          e-mail en via een mededeling in het product. Doorgaand gebruik na ingang betekent aanvaarding van de nieuwe
          versie. Bij wezenlijke nadelige wijziging kun je het abonnement zonder kosten opzeggen tot de ingangsdatum.
        </Para>
        <Para>
          Eerdere versies van de voorwaarden blijven raadpleegbaar op verzoek via <ContactEmail name="legal" />
          .
        </Para>
        <LegalTable
          headers={["Versie", "Datum", "Wat is er veranderd"]}
          rows={[
            [
              "1.0",
              "24 mei 2026",
              "Eerste publicatie. Vervangt alle eerdere conceptbepalingen."
            ]
          ]}
        />
      </LegalSection>

      <LegalSection id="law" n="17" title="Toepasselijk recht">
        <Para>
          Op deze voorwaarden is Nederlands recht van toepassing. Geschillen worden uitsluitend voorgelegd aan de
          bevoegde rechter van de rechtbank Amsterdam. Het Weens Koopverdrag is uitdrukkelijk uitgesloten.
        </Para>
      </LegalSection>

      <LegalSection id="contact" n="18" title="Contact">
        <Para>
          Vragen over deze voorwaarden gaan naar <ContactEmail name="legal" />
          . Vragen over je gegevens gaan naar <ContactEmail name="privacy" />
          . Beveiligingsmeldingen sturen naar <ContactEmail name="security" />
          .
        </Para>
        <Para>
          Een postadres volgt zodra de bedrijfsgegevens van Insyte vastliggen.
        </Para>
      </LegalSection>
    </LegalPage>
  )
}

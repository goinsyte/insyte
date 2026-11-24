import { customer, euro, order, product, when } from "../../fixtures/records.ts"
import { paths } from "../../router.tsx"
import { copyAndSay, exportCsv, undoable } from "../../ui/acts.ts"
import { Status } from "../../ui/badge.tsx"
import { Button } from "../../ui/button.tsx"
import { Figures, FiguresSkeleton, LoadError, RecordSkeleton, TableSkeleton } from "../../ui/data.tsx"
import { Copy, Download, Mail } from "../../ui/icons.tsx"
import { Fact } from "../../ui/key-value.tsx"
import { PageHead, PageSection, Side } from "../../ui/page.tsx"
import { QrCode } from "../../ui/qr.tsx"
import { KitSection, Rule, Spec, State, States } from "./frame.tsx"

/*
 * The pieces every page of records is built from since the areas came over from `/app`: the head
 * and its figures, the side column, the shapes of waiting and failing, the small acts, the QR code.
 * One copy each in `ui/`, so Klanten and the supplier portal wait, fail and undo the same way.
 */

const ASTRID = order("5296")

export function Pages() {
  const buyer = customer(ASTRID?.customerId ?? "")
  const line = ASTRID?.lines[0]
  return (
    <KitSection
      id="paginas"
      title="Pagina's"
      second="Het frame van een lijst of een record"
      intro="Elke pagina met records opent met een kop en zijn cijfers, zet de feiten in een zijkolom zonder kader, en wacht en faalt in dezelfde vorm als de rest. Een actie zegt in een melding wat hij deed, en hoe je het terugdraait."
    >
      <Spec
        id="page"
        title="Kop, cijfers en zijkolom"
        anatomy={[
          "Kop: titel, één regel uitleg, de acties rechts",
          "Cijfers: waarde groot, wat het telt eronder; geen tegels",
          "Zijkolom: kopje in type, dan feiten; geen kader",
          "Feit: klein label boven de waarde"
        ]}
        use={[
          "Bovenaan elke lijst en elk record: Bestellingen, een klant, een leverancier.",
          "`lg`-cijfers alleen als een pagina ermee opent, zoals een portaal; elk cijfer opent dan waar het geteld wordt."
        ]}
        avoid={["Cijfers in kaarten naast elkaar; een kader om de zijkolom."]}
        name="PageHead · PageSection · Figures · Side · Fact"
        file="ui/page.tsx · ui/data.tsx · ui/key-value.tsx"
        summary="Het frame dat elk gebied gebruikt. Zo leest een record in Klanten hetzelfde als een in Leveranciers."
        also="nieuw in v2"
      >
        <States cols={2}>
          <State label="kop en cijfers · md" align="stretch" span={2}>
            <div className="flex w-full flex-col gap-6">
              <PageHead
                title={`Bestelling #${ASTRID?.number ?? ""}`}
                after={<Status tone="warn">Retour</Status>}
                meta={`${buyer?.name ?? ""} · ${ASTRID === undefined ? "" : when(ASTRID.placedAt)}`}
                actions={<Button size="sm" icon={<Mail />}>Mail de klant</Button>}
              />
              <Figures
                label="Kerncijfers van de bestelling"
                items={[
                  { label: "Totaal", value: euro(ASTRID?.total ?? 0) },
                  { label: "Artikelen", value: String(ASTRID?.lines.length ?? 0) },
                  { label: "Retour", value: "R-881", note: "te beoordelen", to: paths.return("r-881") }
                ]}
              />
            </div>
          </State>
          <State label="cijfers · lg, in een portaal" align="stretch">
            <Figures
              size="lg"
              label="Deze week"
              items={[
                { label: "Te verzenden", value: "12", note: "3 vandaag" },
                { label: "Te laat", value: "1", tone: "bad", note: "#6312 wacht op XL" }
              ]}
            />
          </State>
          <State label="zijkolom met feiten" align="stretch">
            <Side id="kit-side" title="Klant">
              <dl className="flex flex-col gap-3">
                <Fact label="Naam">{buyer?.name}</Fact>
                <Fact label="Product">{product(line?.productId ?? "")?.name} · maat {line?.size}</Fact>
              </dl>
            </Side>
          </State>
          <State label="deel van een pagina" align="stretch" span={2}>
            <PageSection id="kit-section" title="Regels" meta="1 artikel">
              <p className="text-sm text-ink-2">Een kopje in type, daarna de inhoud. Geen kader en geen lijn.</p>
            </PageSection>
          </State>
        </States>
      </Spec>

      <Spec
        id="record-states"
        title="Een lijst of record laden en falen"
        anatomy={[
          "Laden: de echte kop en regels op hun echte hoogte",
          "Fout: wat niet kwam, wat het betekent, het verzoek voor support",
          "Opnieuw proberen, en een melding als het lukte"
        ]}
        use={[
          "Op de plek van de tabel of het record; de kop van de pagina blijft staan.",
          "Een eigen zin als het gebied iets weet: een portaal zegt dat de links gewoon doorwerken."
        ]}
        avoid={["Een spinner voor een hele pagina; een fout zonder uitweg."]}
        name="TableSkeleton · RecordSkeleton · FiguresSkeleton · LoadError"
        file="ui/data.tsx"
        summary="Zo wacht en faalt elke lijst in v2. De staat komt uit de demoweergave: ?staat=laden of ?staat=fout."
        also="nieuw in v2"
      >
        <States cols={2}>
          <State label="tabel laden · met werkbalk" align="stretch">
            <TableSkeleton rows={3} columns={[64, 150, 120, 80]} toolbar label="Bestellingen laden" />
          </State>
          <State label="tabel laden · met avatar" align="stretch">
            <TableSkeleton rows={3} columns={4} avatar label="Klanten laden" />
          </State>
          <State label="record laden" align="stretch">
            <RecordSkeleton label="Bestelling laden" />
          </State>
          <State label="cijfers laden" align="stretch">
            <FiguresSkeleton />
          </State>
          <State label="fout · lijst" align="stretch">
            <LoadError what="De bestellingen" detail="GET /orders · 504 · req_9f2c71" size="sm" />
          </State>
          <State label="fout · één record, eigen zin" align="stretch">
            <LoadError one what="De retour" detail="GET /returns/r-881 · 504 · req_e31b77" size="sm">
              Shopify gaf geen antwoord binnen tien seconden. Er is niets verloren gegaan.
            </LoadError>
          </State>
        </States>
      </Spec>

      <Spec
        id="acts"
        title="Kleine handelingen"
        anatomy={[
          "Wat er gebeurde, in een melding",
          "Ongedaan maken, dertig seconden lang",
          "Bij exporteren: hoeveel rijen"
        ]}
        use={["Na elke wijziging die terug kan: een status, een toewijzing, een verwijderde regel."]}
        avoid={["Een bevestigingsvraag vooraf voor iets wat je kunt terugdraaien."]}
        name="undoable · exportCsv · copyAndSay · saveFile"
        file="ui/acts.ts"
        summary="De handelingen die elke lijst en elk record aanbiedt. Elke handeling zegt wat hij deed."
        also="nieuw in v2"
      >
        <States cols={3}>
          <State label="wijzigen, met terugdraaien">
            <Button size="sm" onClick={() => undoable("Retour R-881 aan Sofía Kim toegewezen", () => undefined)}>
              Toewijzen
            </Button>
          </State>
          <State label="kopiëren">
            <Button size="sm" icon={<Copy />} onClick={() => copyAndSay("#5296", "Bestelnummer")}>Kopieer #5296</Button>
          </State>
          <State label="exporteren">
            <Button
              size="sm"
              icon={<Download />}
              onClick={() => exportCsv("bestelling-5296", ["Bestelling", "Totaal"], [["5296", ASTRID?.total ?? 0]])}
            >
              Exporteer CSV
            </Button>
          </State>
        </States>
      </Spec>

      <Spec
        id="qr"
        title="QR-code"
        anatomy={["Een echte, scanbare code", "Inkt van de pagina op een lichte tegel", "Als bestand: zwart op wit"]}
        use={["Een affiliate-link voor een story of flyer; het retourlabel dat de klant laat scannen."]}
        avoid={["Een plaatje dat op een QR-code lijkt maar niet scant."]}
        name="QrCode · downloadQr"
        file="ui/qr.tsx"
        summary="Eigen encoder (bytemodus, foutcorrectie M, versie 1 tot 10). Een link met UTM-tags past erin."
        also="affiliate/link-qr, retourportaal"
      >
        <States cols={2}>
          <State label="link van een affiliate">
            <QrCode text="https://northwind.example/r/priya-singh" size={128} />
          </State>
          <State label="code van een retourlabel">
            <QrCode text="1Z 4R8 7W2 68 5301 3315" size={128} label="QR-code voor het retourlabel van #5301" />
          </State>
        </States>
        <Rule>Scan beide met een telefoon: ze openen de link en tonen de code.</Rule>
      </Spec>
    </KitSection>
  )
}

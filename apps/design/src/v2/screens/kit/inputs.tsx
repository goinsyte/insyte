import { useState } from "react"
import type { FormEvent } from "react"
import { Button } from "../../ui/button.tsx"
import { Checkbox, RadioGroup } from "../../ui/checkbox.tsx"
import { FileDrop, FileRow } from "../../ui/file-drop.tsx"
import { Moon, Sun, Truck } from "../../ui/icons.tsx"
import { Field, Input, SearchField, Select, Textarea } from "../../ui/input.tsx"
import { Notice } from "../../ui/notice.tsx"
import { PeriodPanel, PeriodPicker, PRESETS } from "../../ui/period.tsx"
import type { Period } from "../../ui/period.tsx"
import { SettingRow, SettingsSection } from "../../ui/settings.tsx"
import { toast } from "../../ui/toast.tsx"
import { Segmented, Toggle, ToggleRow } from "../../ui/toggle.tsx"
import { KitSection, Rule, Spec, State, States } from "./frame.tsx"

/** The demo's today: Monday 23 November 2026, as the fixtures have it. */
const DEMO_TODAY = new Date(2026, 10, 23)

const thisWeek = PRESETS.find((p) => p.id === "vorige-week")

const DEMO_PERIOD: Period = {
  preset: "vorige-week",
  range: thisWeek?.range(DEMO_TODAY) ?? { from: DEMO_TODAY, to: DEMO_TODAY },
  compare: "periode"
}

function SupplierForm() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [days, setDays] = useState("5")
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)
  const nameError = tried && name.trim() === "" ? "Vul de naam van de leverancier in." : undefined
  const emailError = tried && !/^\S+@\S+\.\S+$/.test(email)
    ? "Dit is geen e-mailadres: het mist een @ of een domein."
    : undefined
  const daysError = tried && !(Number(days) >= 1 && Number(days) <= 30)
    ? "Kies een levertijd tussen 1 en 30 dagen."
    : undefined
  const submit = (event: FormEvent) => {
    event.preventDefault()
    setTried(true)
    if (name.trim() === "" || !/^\S+@\S+\.\S+$/.test(email) || !(Number(days) >= 1 && Number(days) <= 30)) return
    setSaving(true)
    window.setTimeout(() => {
      setSaving(false)
      setTried(false)
      toast({ title: `${name} toegevoegd`, body: "Zichtbaar onder Leveranciers.", tone: "good" })
      setName("")
      setEmail("")
    }, 900)
  }
  return (
    <form
      noValidate
      onSubmit={submit}
      className="flex max-w-lg flex-col gap-4 rounded-lg bg-panel p-5"
    >
      <h4 className="text-md font-semibold text-ink">Leverancier toevoegen</h4>
      {tried && (nameError ?? emailError ?? daysError) !== undefined && (
        <Notice tone="bad" title="Twee velden kloppen nog niet">Ze staan hieronder gemarkeerd.</Notice>
      )}
      <Field label="Naam" error={nameError}>
        {(c) => (
          <Input
            {...c}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Bijvoorbeeld Kestrel Goods"
          />
        )}
      </Field>
      <Field
        label="E-mail voor bestellingen"
        hint="Hier stuurt Insyte doorgestuurde bestellingen heen."
        error={emailError}
      >
        {(c) => (
          <Input
            {...c}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="orders@leverancier.nl"
          />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Beloofde levertijd" error={daysError}>
          {(c) => (
            <Input
              {...c}
              inputMode="numeric"
              suffix="dagen"
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          )}
        </Field>
        <Field label="Land">
          {(c) => (
            <Select {...c} defaultValue="nl">
              <option value="nl">Nederland</option>
              <option value="de">Duitsland</option>
              <option value="cn">China</option>
            </Select>
          )}
        </Field>
      </div>
      <Field label="Notitie" optional>
        {(c) => <Textarea {...c} placeholder="Afspraken, contactpersoon, openingstijden" />}
      </Field>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={() => setTried(false)}>Annuleren</Button>
        <Button variant="primary" type="submit" loading={saving}>Leverancier toevoegen</Button>
      </div>
    </form>
  )
}

export function Inputs() {
  const [search, setSearch] = useState("Astrid")
  const [checks, setChecks] = useState({ a: true, b: false })
  const [method, setMethod] = useState<"origineel" | "tegoed">("origineel")
  const [on, setOn] = useState(true)
  const [autonomy, setAutonomy] = useState<"zelf" | "vragen" | "nooit">("vragen")
  const [mode, setMode] = useState<"licht" | "donker">("licht")
  const [period, setPeriod] = useState<Period>(DEMO_PERIOD)
  const [files, setFiles] = useState<ReadonlyArray<{ name: string; bytes: number }>>([])

  return (
    <KitSection
      id="invoer"
      second="Eén veldvorm voor alles."
      title="Invoer en formulieren"
      intro="Eén veldvorm voor alles: 32px hoog, een haarlijn, de accentring bij focus, de rode inkt met een teken als iets niet klopt. Een fout zegt wat er mis is en hoe het goed komt, naast het veld."
    >
      <Spec
        id="input"
        title="Tekstveld"
        anatomy={[
          "Voorvoegsel (optioneel): €, een glas",
          "De waarde, getallen als cijfers (.figure)",
          "Achtervoegsel (optioneel): dagen, %, een knop"
        ]}
        name="Input"
        file="ui/input.tsx"
        summary="Tekst, getallen, e-mail. Met een voorvoegsel (€) of achtervoegsel (dagen) binnen het veld; getallen als cijfers (.figure)."
        also="components/input.tsx"
      >
        <States cols={4}>
          <State label="Leeg" align="stretch">
            <Input aria-label="Voorbeeld" placeholder="Zoek een bestelling" />
          </State>
          <State label="Hover" force="hover" align="stretch">
            <Input aria-label="Voorbeeld" defaultValue="Kestrel Goods" />
          </State>
          <State label="Focus" force="focus" align="stretch">
            <Input aria-label="Voorbeeld" defaultValue="Kestrel Goods" />
          </State>
          <State label="Fout" align="stretch">
            <Input aria-label="Voorbeeld" aria-invalid defaultValue="orders@kestrel" />
          </State>
          <State label="Uit" align="stretch">
            <Input aria-label="Voorbeeld" disabled defaultValue="Northwind EU" />
          </State>
          <State label="Alleen lezen" align="stretch">
            <Input aria-label="Voorbeeld" readOnly defaultValue="ord_7Hk29QpX" className="figure" />
          </State>
          <State label="Voorvoegsel" align="stretch">
            <Input aria-label="Bedrag" prefix="€" inputMode="decimal" defaultValue="129,00" />
          </State>
          <State label="Achtervoegsel" align="stretch">
            <Input aria-label="Levertijd" suffix="dagen" inputMode="numeric" defaultValue="5" />
          </State>
        </States>
      </Spec>

      <Spec
        id="field"
        title="Veld met label"
        anatomy={[
          "Label boven het veld, met ‘optioneel’ in woorden",
          "Het veld",
          "Hint, of de fout met teken op dezelfde plek"
        ]}
        use={["Elk veld in een formulier, ook als er maar één is."]}
        avoid={["Een placeholder als label: hij verdwijnt zodra je typt.", "Een sterretje voor verplicht."]}
        name="Field · FieldLabel"
        file="ui/input.tsx"
        summary="Label, veld, en daaronder een hint of de fout. ‘Optioneel’ staat in woorden; verplichte velden krijgen geen sterretje."
        also="common/form-dialog Field, TextField, SelectField"
      >
        <States cols={3}>
          <State label="Met hint" align="stretch">
            <Field label="E-mail voor bestellingen" hint="Hier stuurt Insyte bestellingen heen.">
              {(c) => <Input {...c} defaultValue="orders@kestrel.nl" />}
            </Field>
          </State>
          <State label="Fout" align="stretch">
            <Field label="E-mail voor bestellingen" error="Dit is geen e-mailadres: het mist een domein.">
              {(c) => <Input {...c} defaultValue="orders@kestrel" />}
            </Field>
          </State>
          <State label="Optioneel" align="stretch">
            <Field label="Notitie" optional>
              {(c) => <Input {...c} placeholder="Contactpersoon, openingstijden" />}
            </Field>
          </State>
        </States>
      </Spec>

      <Spec
        id="textarea"
        title="Tekstvak en keuzelijst"
        name="Textarea · Select"
        file="ui/input.tsx"
        summary="Langere tekst groeit naar beneden; een keuze uit een korte lijst is de select van de browser, als veld getekend."
        also="components/textarea.tsx, components/select.tsx"
      >
        <States cols={3}>
          <State label="Textarea" align="stretch">
            <Textarea aria-label="Notitie" defaultValue="Bel na 14:00, dan is de magazijnchef er." />
          </State>
          <State label="Select" align="stretch">
            <Select aria-label="Vervoerder" defaultValue="postnl">
              <option value="postnl">PostNL</option>
              <option value="dpd">DPD</option>
              <option value="dhl">DHL</option>
            </Select>
          </State>
          <State label="Select · uit" align="stretch">
            <Select aria-label="Valuta" disabled defaultValue="eur">
              <option value="eur">Euro (EUR)</option>
            </Select>
          </State>
        </States>
      </Spec>

      <Spec
        id="search-field"
        title="Zoekveld"
        name="SearchField"
        file="ui/input.tsx"
        summary="Zoeken boven een lijst: het glas, de zoekterm, wissen met het kruisje of Escape, en de sneltoets zolang het leeg is."
      >
        <States cols={3}>
          <State label="Leeg, met sneltoets" align="stretch">
            <SearchField
              label="Bestellingen zoeken"
              value=""
              onChange={() => undefined}
              shortcut="/"
              placeholder="Zoek bestellingen"
            />
          </State>
          <State label="Ingevuld" align="stretch">
            <SearchField
              label="Bestellingen zoeken"
              value={search}
              onChange={setSearch}
              placeholder="Zoek bestellingen"
            />
          </State>
          <State label="Focus" force="focus" align="stretch">
            <SearchField
              label="Bestellingen zoeken"
              value=""
              onChange={() => undefined}
              placeholder="Zoek bestellingen"
            />
          </State>
        </States>
      </Spec>

      <Spec
        id="checkbox"
        title="Vinkje en keuzerondje"
        name="Checkbox · RowCheckbox"
        file="ui/checkbox.tsx"
        summary="De echte checkbox van de browser, in het systeem getekend: een haarlijn die met het accent vult. Half voor ‘een deel van de lijst’."
        also="components/checkbox.tsx"
      >
        <States cols={4}>
          <State label="Uit · aan" align="start">
            <span className="flex flex-col gap-2.5">
              <Checkbox label="PostNL" checked={checks.a} onChange={(v) => setChecks({ ...checks, a: v })} />
              <Checkbox label="DPD" checked={checks.b} onChange={(v) => setChecks({ ...checks, b: v })} />
            </span>
          </State>
          <State label="Half" align="start">
            <Checkbox label="Alle vervoerders" checked={false} indeterminate onChange={() => undefined} />
          </State>
          <State label="Focus" force="focus" align="start">
            <Checkbox label="Meldingen per e-mail" checked onChange={() => undefined} />
          </State>
          <State label="Uit · fout" align="start">
            <span className="flex flex-col gap-2.5">
              <Checkbox label="Alleen beheerders" checked disabled onChange={() => undefined} />
              <Checkbox label="Ik ga akkoord" checked={false} invalid onChange={() => undefined} />
            </span>
          </State>
          <State label="Met uitleg" span={2} align="start">
            <Checkbox
              label="Klant mailen bij vertraging"
              description="Gaat via Eerst vragen: de agent legt elke mail eerst aan je voor."
              checked
              onChange={() => undefined}
            />
          </State>
          <State label="RadioGroup" span={2} align="start">
            <RadioGroup
              label="Terugbetalen via"
              value={method}
              onChange={setMethod}
              options={[
                {
                  value: "origineel",
                  label: "Oorspronkelijke betaalmethode",
                  description: "Klarna, iDEAL of kaart, 3 tot 5 werkdagen"
                },
                { value: "tegoed", label: "Tegoed in de winkel", description: "Direct beschikbaar, als kortingscode" }
              ]}
            />
          </State>
        </States>
      </Spec>

      <Spec
        id="toggle"
        title="Schakelaar"
        use={["Iets dat meteen aan of uit gaat, zonder Opslaan."]}
        avoid={["Een schakelaar in een formulier met een Opslaan-knop: dan is het een vinkje."]}
        name="Toggle · ToggleRow"
        file="ui/toggle.tsx"
        summary="Een schakelaar voor wat meteen ingaat, zonder Opslaan. Aan is het accent."
        also="components/switch.tsx"
      >
        <States cols={5}>
          <State label="Aan">
            <Toggle label="Voorbeeld" on={on} onChange={setOn} />
          </State>
          <State label="Uit">
            <Toggle label="Voorbeeld" on={false} onChange={() => undefined} />
          </State>
          <State label="Hover" force="hover">
            <Toggle label="Voorbeeld" on onChange={() => undefined} />
          </State>
          <State label="Focus" force="focus">
            <Toggle label="Voorbeeld" on onChange={() => undefined} />
          </State>
          <State label="Uit te zetten: nee">
            <Toggle label="Voorbeeld" on disabled onChange={() => undefined} />
          </State>
          <State label="ToggleRow" span="full" align="stretch">
            <ToggleRow
              glyph={Truck}
              title="Vervoerder meldt vertraging"
              detail="PostNL, DPD"
              on={on}
              onChange={setOn}
            />
          </State>
        </States>
      </Spec>

      <Spec
        id="segmented"
        title="Gesegmenteerde keuze"
        name="Segmented"
        file="ui/toggle.tsx"
        summary="Twee tot vier korte keuzes naast elkaar: de regel per handeling, de breedte van een blok, licht of donker. Pijltjestoetsen wisselen."
      >
        <States cols={4}>
          <State label="md">
            <Segmented
              label="Regel"
              value={autonomy}
              onChange={setAutonomy}
              options={[
                { value: "zelf", label: "Zelf doen" },
                { value: "vragen", label: "Eerst vragen" },
                { value: "nooit", label: "Nooit" }
              ]}
            />
          </State>
          <State label="sm">
            <Segmented
              size="sm"
              label="Breedte"
              value="half"
              onChange={() => undefined}
              options={[
                { value: "third", label: "⅓" },
                { value: "half", label: "½" },
                { value: "full", label: "Vol" }
              ]}
            />
          </State>
          <State label="Met iconen">
            <Segmented
              size="sm"
              label="Weergave"
              value={mode}
              onChange={setMode}
              options={[{ value: "licht", label: "Licht", icon: <Sun /> }, {
                value: "donker",
                label: "Donker",
                icon: <Moon />
              }]}
            />
          </State>
          <State label="Uit">
            <Segmented
              size="sm"
              disabled
              label="Regel"
              value="nooit"
              onChange={() => undefined}
              options={[{ value: "zelf", label: "Zelf doen" }, { value: "nooit", label: "Nooit" }]}
            />
          </State>
        </States>
      </Spec>

      <Spec
        id="settings"
        title="Instellingen"
        name="SettingsSection · SettingRow"
        file="ui/settings.tsx"
        summary="Een instellingenpagina is secties van regels: links de naam en wat het doet, rechts de bediening. Schakelaars gaan meteen in; tekstvelden bewaart de sectie met haar eigen Opslaan."
        also="settings/setting-card.tsx, settings/form.tsx"
      >
        <div className="max-w-2xl">
          <SettingsSection
            id="kit-winkelchat"
            title="Winkelchat"
            description="Hoe de klantagent antwoordt op de chat in je winkel."
            footer={<Button variant="primary" size="sm">Opslaan</Button>}
          >
            <SettingRow
              title="Klantagent op de winkelchat"
              description="Antwoordt zelf binnen openingstijden en draagt over als hij twijfelt."
              control={<Toggle label="Klantagent op de winkelchat" on={on} onChange={setOn} />}
            />
            <SettingRow
              title="Openingstijden"
              description="Daarbuiten neemt de agent een bericht aan en belooft hij een antwoord."
              control={
                <span className="flex items-center gap-2">
                  <Input aria-label="Van" defaultValue="09:00" className="figure w-20" />
                  <span className="text-xs text-ink-3">tot</span>
                  <Input aria-label="Tot" defaultValue="17:30" className="figure w-20" />
                </span>
              }
            />
            <SettingRow
              title="Welkomstbericht"
              stack
              htmlFor="kit-welkom"
              control={
                <Textarea id="kit-welkom" defaultValue="Hoi! Waar kan ik je mee helpen?" className="w-full" rows={2} />
              }
            />
          </SettingsSection>
        </div>
      </Spec>

      <Spec
        id="period"
        title="Periode"
        name="PeriodPicker · PeriodPanel · Calendar"
        file="ui/period.tsx"
        summary="De periode van een bord, een lijst of een export: de snelkeuzes die mensen echt gebruiken, een kalender voor de rest, en waarmee je vergelijkt. Pas bij Toepassen tekent alles opnieuw."
        also="filters/date range, analytics period"
      >
        <States cols={3}>
          <State label="Trigger">
            <PeriodPicker value={period} onChange={setPeriod} today={DEMO_TODAY} />
          </State>
          <State label="Paneel, open" span={2} align="start">
            <div className="overflow-hidden rounded-lg bg-canvas shadow-pop ring-1 ring-line">
              <PeriodPanel value={period} today={DEMO_TODAY} onApply={setPeriod} />
            </div>
          </State>
        </States>
      </Spec>

      <Spec
        id="file-drop"
        title="Bestanden"
        name="FileDrop · FileRow"
        file="ui/file-drop.tsx"
        summary="Bestanden toevoegen: bewijs voor een chargeback, een prijslijst. De enige gestippelde rand in het systeem: een gat dat je vult. Licht op in het accent als er een bestand boven hangt."
      >
        <States cols={3}>
          <State label="Standaard" align="stretch">
            <FileDrop
              hint="PDF, PNG of JPG, tot 10 MB"
              onFiles={(list) => setFiles((f) => [...f, ...list.map((x) => ({ name: x.name, bytes: x.size }))])}
            />
          </State>
          <State label="Hover" force="hover" align="stretch">
            <FileDrop hint="PDF, PNG of JPG, tot 10 MB" onFiles={() => undefined} />
          </State>
          <State label="Fout" align="stretch">
            <FileDrop
              hint="PDF, PNG of JPG, tot 10 MB"
              invalid="Bewijs.heic is geen PDF, PNG of JPG."
              onFiles={() => undefined}
            />
          </State>
          <State label="Bestanden" span="full" align="stretch">
            <FileRow
              name="bezorgbewijs-postnl.pdf"
              bytes={248_000}
              state={{ kind: "done" }}
              onRemove={() => undefined}
            />
            <FileRow
              name="gesprek-klant-astrid-berg.png"
              bytes={1_420_000}
              state={{ kind: "uploading", progress: 0.62 }}
            />
            <FileRow
              name="factuur-ORD-4821.pdf"
              bytes={3_100_000}
              state={{ kind: "failed", reason: "De verbinding viel weg. Probeer het opnieuw." }}
              onRetry={() => undefined}
              onRemove={() => undefined}
            />
            {files.map((f) => <FileRow key={f.name} name={f.name} bytes={f.bytes} state={{ kind: "done" }} />)}
          </State>
        </States>
      </Spec>

      <Spec
        id="form"
        title="Een formulier"
        name="Formulier (samengesteld)"
        file="Field + Input + Select + Textarea + Notice + Button"
        summary="Een heel formulier uit de onderdelen hierboven. Druk op Leverancier toevoegen zonder iets in te vullen om de fouten te zien."
        also="common/form-dialog.tsx"
      >
        <SupplierForm />
        <Rule>Fouten verschijnen pas na de eerste poging, niet tijdens het typen; de knop blijft drukbaar.</Rule>
      </Spec>
    </KitSection>
  )
}

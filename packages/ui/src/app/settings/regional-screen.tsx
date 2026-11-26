import { useEffect, useState } from "react"
import { toast } from "sonner"
import { formatDate, type Notation } from "../lib/format"
import { FieldRow, SelectInput, UnsavedBar } from "./form"
import { SettingCard } from "./setting-card"
import { type RegionalFields, useRegionalSource } from "./workspace-source"

/* Each choice is stored as its code (`workspaces.regional`) and read as the design names it. */
/*
 * Insyte speaks Dutch only, so Dutch is the one language offered. A workspace that saved another before keeps it, read
 * by its name, until someone picks Nederlands: nothing reads the language yet, so it changes nothing either way.
 */
const LANGUAGES = [{ value: "nl-NL", label: "Nederlands" }]
const OTHER_LANGUAGES: Record<string, string> = {
  "en-US": "Engels (VS)",
  "en-GB": "Engels (VK)",
  "de-DE": "Duits",
  "fr-FR": "Frans"
}
/* The reporting currency (`workspaces.currency`): what the figures are counted in. Each store sells in Shopify's. */
const CURRENCIES = [
  { value: "EUR", label: "EUR · euro" },
  { value: "USD", label: "USD · Amerikaanse dollar" },
  { value: "GBP", label: "GBP · Brits pond" }
]
const DATE_FORMATS: ReadonlyArray<Notation["dateFormat"]> = ["DD MMM YYYY", "MMM DD, YYYY", "YYYY-MM-DD"]
const TIME_FORMATS = [{ value: "24h", label: "24-uurs" }, { value: "12h", label: "12-uurs" }]
const WEEK_STARTS = [
  { value: "mon", label: "Maandag" },
  { value: "sun", label: "Zondag" },
  { value: "sat", label: "Zaterdag" }
]
const TIMEZONES = [
  { value: "Europe/Amsterdam", label: "Europe/Amsterdam (UTC+1)" },
  { value: "Europe/London", label: "Europe/London (UTC+0)" },
  { value: "America/New_York", label: "America/New_York (UTC-5)" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo (UTC+9)" }
]

/** Taal en notatie. What it reads and keeps comes from its host (`workspace-source.tsx`); a refused save keeps the form. */
export function RegionalPage() {
  const source = useRegionalSource()
  const saved = source.saved
  const [form, setForm] = useState(saved)
  const [saving, setSaving] = useState(false)
  useEffect(() => setForm(saved), [saved])
  const dirty = (Object.keys(form) as Array<keyof RegionalFields>).some((k) => form[k] !== saved[k])
  const set = (k: keyof RegionalFields, v: string) => setForm((f) => ({ ...f, [k]: v }))
  // A zone set elsewhere (a store's, an earlier choice) stays readable as itself.
  const timezones = TIMEZONES.some((z) => z.value === form.timezone)
    ? TIMEZONES
    : [...TIMEZONES, { value: form.timezone, label: form.timezone }]
  const languages = LANGUAGES.some((l) => l.value === form.language)
    ? LANGUAGES
    : [...LANGUAGES, { value: form.language, label: OTHER_LANGUAGES[form.language] ?? form.language }]
  // Each date notation read as today's date written in it, as the console writes dates.
  const today = new Date()
  const dateFormats = DATE_FORMATS.map((f) => ({
    value: f,
    label: formatDate(today, { day: "numeric", month: "short", year: "numeric" }, { dateFormat: f, timeFormat: "24h" })
  }))

  const save = async () => {
    setSaving(true)
    try {
      if (await source.save(form)) toast.success("Taal en notatie opgeslagen")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <SettingCard title="Taal en notatie">
        <div className="flex flex-col">
          <FieldRow label="Taal" hint="Insyte is er nu in het Nederlands.">
            <SelectInput value={form.language} onChange={(v) => set("language", v)} options={languages} />
          </FieldRow>
          <FieldRow
            label="Valuta"
            hint="Start, Analyse en Kosten rekenen hierin, tegen de ECB-koers van de dag. Je winkel verkoopt in de valuta uit Shopify."
          >
            <SelectInput value={form.currency} onChange={(v) => set("currency", v)} options={CURRENCIES} />
          </FieldRow>
          {form.currency !== saved.currency
            ? (
              <p role="note" className="text-sm text-ink-2 sm:ml-[232px] sm:max-w-[380px]">
                Na opslaan rekenen Start, Analyse, Kosten en Geschillen alles om naar{" "}
                {form.currency}, ook wat al is ingevoerd. Bedragen die je zelf instelt, zoals terugbetaallimieten, de
                drempel voor geschillen en affiliatebedragen, houden hun getal en gelden dan in {form.currency}.
              </p>
            )
            : null}
          <FieldRow label="Datumnotatie">
            <SelectInput value={form.dateFormat} onChange={(v) => set("dateFormat", v)} options={dateFormats} />
          </FieldRow>
          <FieldRow label="Tijdnotatie">
            <SelectInput value={form.timeFormat} onChange={(v) => set("timeFormat", v)} options={TIME_FORMATS} />
          </FieldRow>
          <FieldRow label="Week begint op">
            <SelectInput value={form.weekStart} onChange={(v) => set("weekStart", v)} options={WEEK_STARTS} />
          </FieldRow>
          <FieldRow label="Tijdzone">
            <SelectInput value={form.timezone} onChange={(v) => set("timezone", v)} options={timezones} />
          </FieldRow>
        </div>
      </SettingCard>
      <UnsavedBar
        visible={dirty}
        saving={saving}
        onDiscard={() => setForm(saved)}
        onSave={() => void save()}
      />
    </>
  )
}

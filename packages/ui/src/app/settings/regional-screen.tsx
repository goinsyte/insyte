import { useEffect, useState } from "react"
import { toast } from "sonner"
import { FieldRow, SelectInput, UnsavedBar } from "./form"
import { SettingCard } from "./setting-card"
import { type RegionalFields, useRegionalSource } from "./workspace-source"

/* Each choice is stored as its code (`workspaces.regional`) and read as the design names it. */
const LANGUAGES = [
  { value: "nl-NL", label: "Nederlands" },
  { value: "en-US", label: "English (United States)" },
  { value: "en-GB", label: "English (United Kingdom)" },
  { value: "de-DE", label: "Deutsch" },
  { value: "fr-FR", label: "Français" }
]
const CURRENCIES = [
  { value: "EUR", label: "EUR · euro" },
  { value: "USD", label: "USD · Amerikaanse dollar" },
  { value: "GBP", label: "GBP · Brits pond" },
  { value: "JPY", label: "JPY · Japanse yen" }
]
const DATE_FORMATS = ["DD MMM YYYY", "MMM DD, YYYY", "YYYY-MM-DD"]
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
          <FieldRow label="Taal">
            <SelectInput value={form.language} onChange={(v) => set("language", v)} options={LANGUAGES} />
          </FieldRow>
          <FieldRow label="Valuta">
            <SelectInput value={form.currency} onChange={(v) => set("currency", v)} options={CURRENCIES} />
          </FieldRow>
          <FieldRow label="Datumnotatie">
            <SelectInput value={form.dateFormat} onChange={(v) => set("dateFormat", v)} options={DATE_FORMATS} />
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

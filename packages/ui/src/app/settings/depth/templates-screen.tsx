import { Link2 } from "../../../icons"
import type { TemplateLinks } from "../../lib/settings-depth"
import { cn } from "../../lib/utils"
import { FieldRow, UnsavedBar } from "../form"
import { SettingCard } from "../setting-card"
import { useSection, WELL } from "./kit"
import { useSettingsDepthSource } from "./source"

const FIELDS: ReadonlyArray<
  { key: keyof TemplateLinks; label: string; variable: string; uses: number; hint: string; empty: string }
> = [
  {
    key: "review",
    label: "Reviewlink",
    variable: "{review_link}",
    uses: 3,
    hint: "Na een bezorging en bij een tevreden antwoord.",
    empty: "Leeg: de zin met deze link valt weg."
  },
  {
    key: "unsubscribe",
    label: "Uitschrijflink",
    variable: "{uitschrijf_link}",
    uses: 2,
    hint: "Voor mails die geen antwoord op een vraag zijn, zoals een reviewverzoek.",
    // The one line that may not drop out: the server refuses such a mail until the link is saved.
    empty: "Leeg: een mail met deze variabele wordt niet verstuurd."
  },
  {
    key: "restock",
    label: "Weer-op-voorraad-link",
    variable: "{voorraad_link}",
    uses: 1,
    hint: "Als een klant vraagt wanneer iets terug is.",
    empty: "Leeg: de zin met deze link valt weg."
  }
]

const bad = (v: string) => v.trim() !== "" && !/^https:\/\/[^\s.]+\.[^\s]+$/.test(v.trim())

/**
 * Sjablonen (`/settings/templates`, PLAN 43): the fixed links reply templates and the customer
 * agent put in, set once. An empty link drops the sentence that carries it rather than sending a
 * mail with a hole in it, and the preview shows exactly that; an empty unsubscribe link holds the
 * mail that asks for it instead. The preview is a neutral example, not any store's customer.
 */
export function TemplatesPage() {
  const s = useSection(
    "links",
    "Sjablonen",
    (a, b) => FIELDS.filter((f) => a[f.key] !== b[f.key]).map((f) => [f.label, a[f.key], b[f.key]])
  )
  const usage = useSettingsDepthSource().linkUsage
  const invalid = FIELDS.some((f) => bad(s.draft[f.key]))
  return (
    <>
      <SettingCard
        title="Vaste links"
        icon={Link2}
        subtitle="Een link per soort. Zet de variabele in een sjabloon of in een mail die je schrijft."
      >
        <div className="flex flex-col">
          {FIELDS.map((f) => {
            const uses = usage?.[f.key] ?? f.uses
            return (
              <FieldRow
                key={f.key}
                label={f.label}
                hint={`${f.hint} In ${uses} ${uses === 1 ? "sjabloon" : "sjablonen"}.`}
              >
                <span className="flex flex-col gap-1.5">
                  <input
                    value={s.draft[f.key]}
                    disabled={!s.canEdit}
                    onChange={(e) => s.setDraft({ ...s.draft, [f.key]: e.target.value })}
                    placeholder="https://"
                    inputMode="url"
                    aria-invalid={bad(s.draft[f.key])}
                    aria-label={f.label}
                    className={cn(WELL, "aria-[invalid=true]:bg-signal-red-bg")}
                  />
                  <span className="flex items-center gap-2 text-xs">
                    <code className="rounded bg-ink/6 px-1.5 py-0.5 font-sans text-ink-2">{f.variable}</code>
                    {bad(s.draft[f.key])
                      ? <span className="text-signal-red">Een link begint met https:// en heeft een domein.</span>
                      : !s.draft[f.key]
                      ? <span className="text-ink-3">{f.empty}</span>
                      : null}
                  </span>
                </span>
              </FieldRow>
            )
          })}
        </div>
      </SettingCard>
      <SettingCard
        title="Voorbeeld"
        subtitle="Een mail met de review- en de uitschrijflink, zoals de klant hem krijgt."
      >
        <div className="max-w-[560px] rounded-xl bg-paper p-5 text-base text-ink leading-[1.6] shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
          <p>Hoi,</p>
          <p className="mt-3">Je pakket is bezorgd. We hopen dat je bestelling goed bevalt.</p>
          {s.draft.review ?
            (
              <p className="mt-3">
                Vertel je ons wat je ervan vindt?{" "}
                <span className="text-arc-ink underline decoration-arc-ink/35 underline-offset-2">
                  {s.draft.review}
                </span>
              </p>
            ) :
            null}
          <p className="mt-3">Groet, het team</p>
          {s.draft.unsubscribe
            ? (
              <p className="mt-4 text-ink-3 text-xs">
                Liever geen mails meer? Schrijf je uit via <span className="underline">{s.draft.unsubscribe}</span>
              </p>
            )
            : (
              <p className="mt-4 text-signal-red text-xs">
                Zonder uitschrijflink wordt deze mail niet verstuurd.
              </p>
            )}
        </div>
      </SettingCard>
      <UnsavedBar
        visible={s.dirty && s.canEdit && !invalid}
        onDiscard={s.discard}
        onSave={() => s.save("Vaste links opgeslagen", "Sjablonen gebruiken vanaf nu deze links.")}
      />
    </>
  )
}

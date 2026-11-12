import { useState } from "react"
import { Switch } from "../../../components/switch"
import { Shield, Trash2 } from "../../../icons"
import { ConfirmDialog } from "../../common/confirm-dialog"
import { formatRelative } from "../../lib/format"
import { cn } from "../../lib/utils"
import { UnsavedBar } from "../form"
import { SettingCard } from "../setting-card"
import { useSection } from "./kit"
import { useSettingsDepthSource } from "./source"

const PERIODS: ReadonlyArray<{ months: number | null; label: string }> = [
  { months: 3, label: "3 maanden" },
  { months: 6, label: "6 maanden" },
  { months: 12, label: "1 jaar" },
  { months: 24, label: "2 jaar" },
  { months: 36, label: "3 jaar" },
  { months: null, label: "Niet verwijderen" }
]
const label = (m: number | null) => PERIODS.find((p) => p.months === m)?.label ?? `${m} maanden`

/**
 * Gegevens en privacy (`/settings/privacy`, PLAN 43): how long each kind of data is kept, a dry run
 * that counts what would go, and only then the switch that erases it every night. Turning erasing
 * on asks first, because what it removes cannot be brought back. The count and the switch are the host's
 * (`SettingsDepthSource.privacy`); a period changed since the count shows no figure until it is counted again.
 */
export function PrivacyPage() {
  const s = useSection("privacy", "Gegevens en privacy", (a, b) =>
    b.classes.flatMap((c) => {
      const o = a.classes.find((x) => x.id === c.id)
      return o && o.months !== c.months
        ? [[`Bewaren: ${c.label}`, label(o.months), label(c.months)] as [string, string, string]]
        : []
    }), 3)
  const privacy = useSettingsDepthSource().privacy!
  const live = { erasing: privacy.erasing }
  const counted = privacy.countedAt
  const [confirm, setConfirm] = useState(false)
  const total = s.draft.classes.reduce((n, c) => n + (privacy.countOf(c, c.months) ?? 0), 0)

  const count = () => privacy.count(s.draft.classes)
  const setErasing = (on: boolean) =>
    privacy.setErasing(
      on,
      on
        ? { label: "Verwijderen staat aan", detail: "Vannacht om 03:00 verwijdert Insyte wat ouder is dan de termijn." }
        : { label: "Verwijderen staat uit", detail: "Er wordt niets meer verwijderd tot je het weer aanzet." }
    )

  return (
    <>
      <SettingCard
        title="Bewaartermijnen"
        icon={Shield}
        subtitle="Na deze termijn verwijdert Insyte de gegevens, als verwijderen aanstaat. Bestellingen en facturen bewaart de wet 7 jaar; die vallen hier niet onder."
      >
        <div className="overflow-hidden rounded-xl bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
          {s.draft.classes.map((c, i) => (
            <div
              key={c.id}
              className={cn(
                "grid grid-cols-1 items-center gap-x-6 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_170px_120px]",
                i % 2 ? "bg-mist/40" : "bg-paper"
              )}
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium text-ink text-sm">{c.label}</span>
                <span className="text-ink-3 text-sm">{c.detail}</span>
              </span>
              <select
                value={c.months ?? "never"}
                disabled={!s.canEdit}
                onChange={(e) =>
                  s.setDraft({
                    ...s.draft,
                    classes: s.draft.classes.map((x) => (x.id === c.id
                      ? { ...x, months: e.target.value === "never" ? null : Number(e.target.value) }
                      : x)
                    )
                  })}
                aria-label={`Bewaartermijn ${c.label}`}
                className="field h-9 rounded-md px-2.5 text-ink text-sm outline-none focus:bg-paper"
              >
                {PERIODS.map((p) => (
                  <option key={p.label} value={p.months ?? "never"}>
                    {p.label}
                  </option>
                ))}
              </select>
              <span className="text-right text-sm tabular-nums">
                {counted && privacy.countOf(c, c.months) !== null
                  ? (
                    <span className={privacy.countOf(c, c.months) ? "text-ink" : "text-ink-3"}>
                      {(privacy.countOf(c, c.months) ?? 0).toLocaleString("nl-NL")} weg
                    </span>
                  )
                  : <span className="text-ink-3">—</span>}
              </span>
            </div>
          ))}
        </div>
      </SettingCard>

      <SettingCard title="Verwijderen" subtitle="Eerst tellen wat er weg zou gaan; pas dan aanzetten.">
        <div className="flex flex-col gap-3 rounded-xl bg-paper p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
          <div className="flex flex-wrap items-center gap-3">
            <span className={cn("size-2", live.erasing ? "bg-signal-green" : "bg-ink-4")} aria-hidden />
            <span className="min-w-0 flex-1 text-ink text-sm">
              <span className="font-medium">{live.erasing ? "Verwijderen staat aan." : "Alleen tellen."}</span>{" "}
              {live.erasing ? "Elke nacht om 03:00." : "Er wordt nog niets verwijderd."}
              {counted
                ? (
                  <span className="text-ink-2">
                    Bij de huidige termijnen gaan {total.toLocaleString("nl-NL")} items weg (geteld{" "}
                    {formatRelative(counted)}).
                  </span>
                )
                : null}
            </span>
            <button
              type="button"
              onClick={count}
              disabled={privacy.counting}
              className="field flex h-8 items-center rounded-md px-2.5 font-medium text-ink text-sm hover:field-hover"
            >
              Nu tellen
            </button>
            {live.erasing ?
              (
                <label className="flex items-center gap-2 text-ink-2 text-sm">
                  <Switch checked onCheckedChange={() => setErasing(false)} disabled={!s.canEdit} />
                  Aan
                </label>
              ) :
              (
                <button
                  type="button"
                  disabled={!s.canEdit || !counted || s.dirty}
                  title={!counted ? "Tel eerst wat er weg zou gaan" : s.dirty ? "Sla eerst de termijnen op" : undefined}
                  onClick={() => setConfirm(true)}
                  className="flex h-8 items-center gap-1.5 rounded-md bg-signal-red px-2.5 font-medium text-mesh-ink text-sm transition-colors hover:bg-signal-red/90 disabled:opacity-45"
                >
                  <Trash2 className="size-3.5" strokeWidth={1.75} />
                  Verwijderen aanzetten
                </button>
              )}
          </div>
        </div>
      </SettingCard>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        tone="destructive"
        title="Verwijderen aanzetten?"
        description={`Vannacht verwijdert Insyte ${
          total.toLocaleString("nl-NL")
        } items die ouder zijn dan hun termijn, en daarna elke nacht. Wat verwijderd is, komt niet terug.`}
        confirmLabel="Aanzetten"
        onConfirm={() => {
          setConfirm(false)
          setErasing(true)
        }}
      />
      <UnsavedBar
        visible={s.dirty && s.canEdit}
        onDiscard={s.discard}
        onSave={() =>
          s.save("Bewaartermijnen opgeslagen", live.erasing ? "Vannacht geldt de nieuwe termijn." : undefined)}
      />
    </>
  )
}

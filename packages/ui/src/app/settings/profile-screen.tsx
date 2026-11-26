import { type ReactNode, useEffect, useState } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../../components/dialog"
import { Archive, Bell, Check, CreditCard, Download, Store, Trash2, Users } from "../../icons"
import { ConfirmDialog } from "../common/confirm-dialog"
import { PageGuide } from "../common/page-guide"
import { cn } from "../lib/utils"
import {
  type FieldControl,
  FieldRow,
  INPUT_CLASS,
  INVALID_CLASS,
  type SaveOutcome,
  SelectInput,
  TextInput,
  UnsavedBar,
  useFieldErrors
} from "./form"
import { BandedList, SettingCard, SettingsItem } from "./setting-card"
import { accountErrors, type AlertFields, type RetentionDays, useAccountSource } from "./workspace-source"

const GUIDE = [
  {
    title: "Wat op facturen staat",
    body:
      "De rechtspersoon, het btw-nummer en het land staan op facturen. Facturen en betaalberichten gaan naar het factuur-e-mailadres.",
    art: "budget"
  },
  {
    title: "Wanneer Insyte meldt",
    body: "Een bestelling die na zoveel uur nog niet verzonden is, en elke chargeback vanaf het bedrag dat je kiest.",
    art: "notify"
  },
  {
    title: "Als een winkel sluit",
    body:
      "Bestellingen, klanten, tickets en geschillen blijven zo lang leesbaar als je kiest. Daarna gaan ze naar het archief.",
    art: "log"
  }
] as const

// Kept as text while typed, so a cleared field reads as empty rather than as 0.
const alertText = (alerts: AlertFields) => ({
  delayHours: String(alerts.delayHours),
  disputeAmount: String(alerts.disputeAmount)
})

/** A field the server refused that the page did not catch itself, said at the field. */
const SERVER_SAYS: Record<string, string> = {
  workspace: "Geef de werkruimte een naam van hoogstens 80 tekens.",
  legalEntity: "Hoogstens 200 tekens.",
  vat: "Dat btw-nummer klopt niet. Begin met de landcode, zoals NL123456789B01.",
  billingEmail: "Een e-mailadres als facturen@jouwbedrijf.nl.",
  country: "Kies een land uit de lijst.",
  delayHours: "Een late bestelling is 1 tot en met 720 uur oud.",
  disputeAmount: "Een bedrag van 0 of meer."
}

/**
 * The workspace's own facts, and nothing else.
 *
 * This page used to stack Account, Team, Stores and Integrations — four framed sections, three of
 * which are also their own entries in the area panel beside it, so the same team was listed in two
 * places with two different sets of people. Each section is its own page now, and this one is the
 * workspace: the name, the legal entity, where the invoices go.
 *
 * Fields sit beside their labels, in the filled wells the sign-in screen uses. Saving is not a
 * button waiting at the bottom of the form: the moment something changes, a bar rises from the foot
 * of the page that says so and offers both ways out, and it goes once the change is kept or undone.
 *
 * What it reads and writes comes from its host (`workspace-source.tsx`). A save the host refuses keeps
 * what was typed, and the bar stays up; what is wrong is said under its field, before the save goes out where the page
 * can tell, and after the server's answer where only it can.
 */
export function AccountSettingsPage() {
  const source = useAccountSource()
  const { account, alerts, members, stores } = source
  const [form, setForm] = useState(account)
  const [alertForm, setAlertForm] = useState(() => alertText(alerts))
  const [deleting, setDeleting] = useState(false)
  const [retention, setRetention] = useState(false)
  useEffect(() => setForm(account), [account])
  useEffect(() => setAlertForm(alertText(alerts)), [alerts])

  const accountDirty = (Object.keys(form) as Array<keyof typeof form>).some((k) => form[k] !== account[k])
  const alertsDirty = alertForm.delayHours !== String(alerts.delayHours) ||
    alertForm.disputeAmount !== String(alerts.disputeAmount)
  const dirty = accountDirty || alertsDirty
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }))
  const fe = useFieldErrors(accountErrors(form, alertForm), {
    draftKey: JSON.stringify([form, alertForm]),
    say: (field) => SERVER_SAYS[field] ?? "Dit klopt nog niet."
  })

  // The Werkruimte first, then the thresholds; one the server refuses stops there, with its fields marked.
  const save = async (): Promise<SaveOutcome> => {
    const accountKept = accountDirty ? await source.saveAccount(form) : true
    if (accountKept !== true) return accountKept
    const alertsKept = alertsDirty
      ? await source.setAlerts({
        delayHours: Number(alertForm.delayHours),
        disputeAmount: Number(alertForm.disputeAmount)
      })
      : true
    if (alertsKept !== true) return alertsKept
    toast.success(accountDirty ? "Werkruimte opgeslagen" : "Drempels voor meldingen opgeslagen")
    return true
  }

  return (
    <>
      <SettingCard title="Werkruimte">
        <div className="flex flex-col">
          <FieldRow label="Naam werkruimte">
            <Wrong message={fe.message("workspace")}>
              <TextInput control={fe.control("workspace")} value={form.workspace} onChange={set("workspace")} />
            </Wrong>
          </FieldRow>
          <FieldRow label="Rechtspersoon">
            <Wrong message={fe.message("legalEntity")}>
              <TextInput control={fe.control("legalEntity")} value={form.legalEntity} onChange={set("legalEntity")} />
            </Wrong>
          </FieldRow>
          <FieldRow label="Btw-nummer">
            <Wrong message={fe.message("vat")}>
              <TextInput control={fe.control("vat")} value={form.vat} onChange={set("vat")} />
            </Wrong>
          </FieldRow>
          <FieldRow label="Factuur-e-mail">
            <Wrong message={fe.message("billingEmail")}>
              <TextInput
                control={fe.control("billingEmail")}
                type="email"
                value={form.billingEmail}
                onChange={set("billingEmail")}
              />
            </Wrong>
          </FieldRow>
          <FieldRow label="Land">
            <SelectInput value={form.country} onChange={set("country")} options={source.countries} />
          </FieldRow>
        </div>
      </SettingCard>

      <SettingCard
        id="alerts"
        title="Meldingen"
        icon={Bell}
      >
        <div className="flex flex-col">
          <FieldRow label="Late bestelling">
            <Wrong message={fe.message("delayHours")}>
              <NumberInput
                control={fe.control("delayHours")}
                value={alertForm.delayHours}
                onChange={(v) => setAlertForm((f) => ({ ...f, delayHours: v }))}
                unit="uur"
              />
            </Wrong>
          </FieldRow>
          <FieldRow label="Groot geschil">
            <Wrong message={fe.message("disputeAmount")}>
              <NumberInput
                control={fe.control("disputeAmount")}
                value={alertForm.disputeAmount}
                onChange={(v) => setAlertForm((f) => ({ ...f, disputeAmount: v }))}
                prefix={source.disputePrefix}
              />
            </Wrong>
          </FieldRow>
        </div>
      </SettingCard>

      <SettingCard title="Rond de werkruimte">
        <BandedList>
          <SettingsItem
            icon={Users}
            tone="arc"
            title="Team en rollen"
            detail={members === null ? undefined : `${members} ${members === 1 ? "persoon" : "personen"}`}
            to="/settings/team"
          />
          <SettingsItem
            icon={Store}
            tone="arc"
            title="Winkels"
            detail={stores === null ? undefined : `${stores.connected} van ${stores.total} gekoppeld aan Shopify`}
            to="/settings/stores"
          />
          <SettingsItem
            icon={CreditCard}
            tone="arc"
            title="Facturatie"
            detail="Abonnement, betaalmethode en facturen"
            to="/settings/billing"
          />
        </BandedList>
      </SettingCard>

      <SettingCard title="Je data">
        <BandedList>
          <SettingsItem
            icon={Download}
            tone="green"
            title="Je data downloaden"
            detail="Alles in één bestand"
            {...(source.download ? { onClick: source.download } : { to: "/settings/data" })}
          />
          <SettingsItem
            icon={Archive}
            title="Als een winkel sluit"
            detail={`De gegevens blijven ${source.retentionDays} dagen leesbaar`}
            onClick={() => setRetention(true)}
          />
          <SettingsItem
            icon={Trash2}
            tone="danger"
            title="Werkruimte verwijderen"
            detail={source.remove ? "Dit kan niet ongedaan worden gemaakt" : "Na 7 dagen wachten, onder Je gegevens"}
            {...(source.remove ? { onClick: () => setDeleting(true) } : { to: "/settings/data" })}
          />
        </BandedList>
      </SettingCard>

      {source.remove ?
        (
          <ConfirmDialog
            open={deleting}
            onOpenChange={setDeleting}
            tone="destructive"
            title={`${account.workspace} verwijderen?`}
            description={
              <>
                Elke winkel, bestelling, ticket en collega gaat mee, en er is geen weg terug. Download eerst je data als
                je een kopie wilt.
                {source.remove.note}
              </>
            }
            confirmLabel="Werkruimte verwijderen"
            onConfirm={source.remove.confirm}
          />
        ) :
        null}

      <RetentionDialog open={retention} onOpenChange={setRetention} />

      <UnsavedBar
        visible={dirty}
        onDiscard={() => {
          setForm(account)
          setAlertForm(alertText(alerts))
        }}
        onSave={fe.guard(save)}
      />
      <PageGuide id="settings.profile" title="Account" steps={GUIDE} />
    </>
  )
}

/** A control with its error under it, while it has one. */
function Wrong({ message, children }: { message: ReactNode; children: ReactNode }) {
  return (
    <span className="flex flex-col gap-1.5">
      {children}
      {message}
    </span>
  )
}

function NumberInput({
  value,
  onChange,
  unit,
  prefix,
  control
}: {
  value: string
  onChange: (v: string) => void
  unit?: string
  prefix?: string
  control: FieldControl
}) {
  return (
    <span className="relative block">
      {prefix ?
        (
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-base text-ink-3">
            {prefix}
          </span>
        ) :
        null}
      <input
        {...control}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
        className={cn(INPUT_CLASS, INVALID_CLASS, "tabular-nums", prefix && "pl-6", unit && "pr-16")}
      />
      {unit ?
        (
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-base text-ink-3">
            {unit}
          </span>
        ) :
        null}
    </span>
  )
}

const RETENTION: Array<{ days: RetentionDays; detail: string }> = [
  { days: 30, detail: "Genoeg om de laatste terugbetalingen en retouren af te ronden." },
  { days: 90, detail: "Dekt de meeste termijnen voor kaartgeschillen. De standaard." },
  { days: 180, detail: "Dekt de langste chargeback-termijnen die kaartnetwerken toestaan." }
]

/**
 * What happens to a closed store's records, and how long they stay before they are archived. Changing it takes more
 * than the page's own fields do (Beheren); a role without it reads the choice and is told why it cannot change it.
 */
function RetentionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const source = useAccountSource()
  const saved = source.retentionDays
  const may = source.manage.ok
  const [pick, setPick] = useState(saved)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (open) setPick(saved)
  }, [open, saved])

  const save = async () => {
    setSaving(true)
    try {
      if (await source.setRetention(pick)) {
        onOpenChange(false)
        toast.success(`Gesloten winkels blijven ${pick} dagen leesbaar`)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => saving || onOpenChange(v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Als een winkel sluit</DialogTitle>
          <DialogDescription>
            Als je een winkel ontkoppelt of sluit, worden nieuwe bestellingen niet meer gesynchroniseerd. De
            bestellingen, klanten, tickets en geschillen blijven leesbaar, zodat je een late chargeback nog kunt
            beantwoorden, en gaan daarna naar het archief. Gearchiveerde gegevens kun je op verzoek terugzetten.
          </DialogDescription>
        </DialogHeader>
        <div role="radiogroup" aria-label="Gegevens leesbaar houden voor" className="flex flex-col gap-1.5">
          <span className="font-medium text-xs text-ink-2">Gegevens leesbaar houden voor</span>
          {RETENTION.map((r) => (
            <button
              key={r.days}
              type="button"
              role="radio"
              aria-checked={pick === r.days}
              disabled={!may || saving}
              onClick={() => setPick(r.days)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors disabled:cursor-default",
                pick === r.days ? "bg-arc-tint" : "bg-mist hover:bg-ink/6 disabled:hover:bg-mist"
              )}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium text-base text-ink tabular-nums">{r.days} dagen</span>
                <span className="text-sm text-ink-2">{r.detail}</span>
              </span>
              {pick === r.days ? <Check className="size-4 shrink-0 text-arc-ink" strokeWidth={2} /> : null}
            </button>
          ))}
          {may ? null : <span className="text-sm text-ink-3">{source.manage.reason}.</span>}
        </div>
        <DialogFooter>
          <button
            type="button"
            disabled={saving}
            onClick={() => onOpenChange(false)}
            className="flex h-9 items-center justify-center rounded-md px-3 font-medium text-base text-ink hover:bg-ink/6 disabled:pointer-events-none disabled:opacity-50"
          >
            Annuleren
          </button>
          <button
            type="button"
            disabled={!may || saving}
            aria-busy={saving}
            onClick={() => void save()}
            className="flex h-9 items-center justify-center rounded-md bg-abyss px-3 font-medium text-base text-mesh-ink shadow-primary transition hover:bg-abyss-2 active:scale-[0.98] disabled:pointer-events-none disabled:bg-ink/8 disabled:text-ink-3 disabled:shadow-none"
          >
            {saving ? "Opslaan…" : "Opslaan"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import { Link } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../../components/dialog"
import { Database, Download, Eye, Globe, type IconComponent, Trash2, Users, UserSearch } from "../../icons"
import { formatDate } from "../lib/format"
import { cn } from "../lib/utils"
import {
  type DataCategoryId,
  type ExportEntry,
  type ExportSchedule,
  type Level,
  type ShopperRequestEntry,
  useDataSource
} from "./data-source"
import { FieldRow, INPUT_CLASS, SelectInput, UnsavedBar } from "./form"
import { BandedList, BandedRow, SectionAction, SettingCard, StatusPill } from "./setting-card"

/** What each category holds, in the words the operator reads it in. */
const CATEGORY: Record<DataCategoryId, { label: string; detail: string }> = {
  customers: { label: "Klanten", detail: "Namen, e-mailadressen, adressen en telefoonnummers uit je winkels" },
  orders: { label: "Bestellingen", detail: "Regels, bedragen, verzending en terugbetalingen" },
  products: { label: "Producten", detail: "Titels, varianten, prijzen en voorraad" },
  support: { label: "Klantcontact", detail: "Tickets en e-mails met klanten" },
  chats: { label: "Teamchat", detail: "Berichten tussen collega's" },
  returns: { label: "Retouren", detail: "Aanvragen, redenen, labels en pakketten" },
  chargebacks: { label: "Chargebacks", detail: "Geschillen en het bewijs dat erbij hoort" },
  files: { label: "Bestanden", detail: "Pakbonnen, labels, bewijsstukken, logo's en exports" },
  team: { label: "Team", detail: "Collega's, hun rol en de winkels die ze zien" },
  log: { label: "Logboek", detail: "Wie wat veranderde, en wanneer" }
}

const LEVEL: Record<Level, string> = { 0: "Geen", 1: "Bekijken", 2: "Bewerken", 3: "Beheren" }

const SCHEDULES: ReadonlyArray<{ value: ExportSchedule; label: string }> = [
  { value: "off", label: "Uit" },
  { value: "weekly", label: "Elke week" },
  { value: "monthly", label: "Elke maand" }
]

const day = (at: number) => formatDate(new Date(at), { day: "numeric", month: "long", year: undefined })
const moment = (at: number) =>
  formatDate(new Date(at), { day: "numeric", month: "long", year: undefined, hour: "2-digit", minute: "2-digit" })
const count = (n: number) => n.toLocaleString("nl-NL")

const size = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("nl-NL")} kB`
    : `${(bytes / (1024 * 1024)).toLocaleString("nl-NL", { maximumFractionDigits: 1 })} MB`

/**
 * Je gegevens (`/settings/data`, PLAN 48): the answer to "waar staan de gegevens van onze klanten?". What Insyte
 * holds, counted; where it is kept and who else handles it; which roles reach the shoppers' data; the full export,
 * by hand or on a schedule; a shopper's request to see or erase what is held; and deleting the workspace, which waits
 * seven days and can be stopped until then. What the page reads and does is its host's (`data-source.tsx`).
 */
export function YourDataPage() {
  return (
    <>
      <Inventory />
      <Residency />
      <Reach />
      <Exports />
      <ShopperRequests />
      <Deletion />
    </>
  )
}

function Inventory() {
  const { inventory } = useDataSource()
  const total = inventory.categories.reduce((n, c) => n + c.count, 0)
  return (
    <SettingCard
      title="Wat Insyte bewaart"
      icon={Database}
      subtitle={`${count(total)} ${
        total === 1 ? "record" : "records"
      } in deze werkruimte, per soort. Alles hoort bij deze werkruimte en bij geen andere.`}
    >
      <div className="overflow-hidden rounded-xl bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
        {inventory.categories.map((c, i) => (
          <div
            key={c.id}
            className={cn(
              "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 px-4 py-2.5",
              i % 2 ? "bg-mist/40" : "bg-paper"
            )}
          >
            <span className="flex min-w-0 flex-col">
              <span className="font-medium text-ink text-sm">{CATEGORY[c.id].label}</span>
              <span className="truncate text-ink-3 text-sm">{CATEGORY[c.id].detail}</span>
            </span>
            <data
              value={c.count}
              className={cn("text-right text-sm tabular-nums", c.count ? "text-ink" : "text-ink-3")}
            >
              {count(c.count)}
            </data>
          </div>
        ))}
      </div>
    </SettingCard>
  )
}

function Residency() {
  const { inventory } = useDataSource()
  return (
    <SettingCard
      title="Waar het staat"
      icon={Globe}
      subtitle="Insyte bewaart alles in de Europese Unie. Werkruimtes zijn in de database zelf van elkaar gescheiden: elke rij hoort bij één werkruimte, en een verzoek krijgt alleen de rijen van de werkruimte waarin het is gedaan."
    >
      <div className="flex flex-col">
        {inventory.places.map((p) => (
          <div
            key={p.what}
            className="grid grid-cols-1 gap-x-8 gap-y-0.5 py-1.5 sm:grid-cols-[200px_minmax(0,1fr)]"
          >
            <span className="font-medium text-ink text-sm">{p.what}</span>
            <span className="text-ink-2 text-sm">{p.where}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2 pt-2">
        <h3 className="font-medium text-ink text-sm">Diensten die gegevens voor Insyte verwerken</h3>
        <BandedList>
          {inventory.subProcessors.map((s) => (
            <BandedRow
              key={s.name}
              title={s.name}
              detail={<span className="whitespace-normal">{s.purpose}. {s.where}.</span>}
              trailing={s.outsideEu
                ? <StatusPill tone="warning" label="Ook buiten de EU" />
                : <StatusPill tone="success" label="In de EU" />}
            />
          ))}
        </BandedList>
      </div>
    </SettingCard>
  )
}

function Reach() {
  const { inventory } = useDataSource()
  return (
    <SettingCard
      title="Wie wat ziet"
      icon={Users}
      subtitle="Wat elke rol van de gegevens van je klanten kan zien. Een rol die op winkels is ingeperkt, ziet alleen die winkels."
      action={
        <Link
          to="/settings/roles"
          className="font-medium text-arc-ink text-sm underline decoration-arc-ink/35 underline-offset-4 hover:decoration-arc-ink"
        >
          Rollen beheren
        </Link>
      }
    >
      <div className="table-scroll rounded-xl bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="text-left text-ink-3 text-xs">
              <th className="h-8 px-4 font-medium">Rol</th>
              <th className="h-8 px-3 font-medium">Klanten</th>
              <th className="h-8 px-3 font-medium">Bestellingen</th>
              <th className="h-8 px-3 font-medium">Klantcontact</th>
              <th className="h-8 px-4 font-medium">Exporteren</th>
            </tr>
          </thead>
          <tbody>
            {inventory.roles.map((r, i) => (
              <tr key={r.id} className={i % 2 ? "bg-paper" : "bg-mist/40"}>
                <td className="h-11 px-4">
                  <span className="flex flex-col">
                    <span className="font-medium text-ink">{r.label}</span>
                    <span className="text-ink-3 text-xs">
                      {r.members} {r.members === 1 ? "persoon" : "personen"}
                      {r.someStores ? " · eigen winkels" : ""}
                    </span>
                  </span>
                </td>
                {[r.customers, r.orders, r.support].map((l, k) => (
                  <td key={k} className={cn("px-3", l === 0 ? "text-ink-3" : "text-ink-2")}>{LEVEL[l]}</td>
                ))}
                <td className={cn("px-4", r.exports ? "text-ink-2" : "text-ink-3")}>{r.exports ? "Ja" : "Nee"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SettingCard>
  )
}

const exportTitle = (e: ExportEntry) => `Export van ${day(e.requestedAt)}`

const exportDetail = (e: ExportEntry) => {
  const who = e.source === "insyte" ? "Automatisch" : e.requestedBy === null ? "Op verzoek" : `Door ${e.requestedBy}`
  switch (e.state) {
    case "open":
    case "running":
      return `${who} · wordt gemaakt`
    case "failed":
      return `${who} · niet gelukt, vraag hem opnieuw aan`
    default:
      return e.href === null
        ? `${who} · was te downloaden tot ${day(e.expiresAt ?? 0)}`
        : `${who} · ${e.sizeBytes === null ? "" : `${size(e.sizeBytes)} · `}te downloaden tot ${day(e.expiresAt ?? 0)}`
  }
}

function Exports() {
  const source = useDataSource()
  const saved = source.requests.schedule
  const [draft, setDraft] = useState<ExportSchedule>(saved)
  const [asking, setAsking] = useState(false)
  useEffect(() => setDraft(saved), [saved])
  const making = source.requests.exports.some((e) => e.state === "open" || e.state === "running")
  const ask = async () => {
    setAsking(true)
    try {
      if (await source.requestExport()) {
        toast.success("Export wordt gemaakt", { description: "Hij staat hieronder zodra hij klaar is." })
      }
    } finally {
      setAsking(false)
    }
  }
  return (
    <SettingCard
      id="export"
      title="Export"
      icon={Download}
      subtitle="Alles van deze werkruimte in één ZIP: elke tabel als CSV en als JSON. Sleutels van gekoppelde diensten staan er niet in. Een export blijft 7 dagen te downloaden."
      action={
        <SectionAction
          icon={<Download className="size-3.5" strokeWidth={1.75} />}
          disabled={!source.owner || asking || making}
          onClick={() => void ask()}
        >
          {making ? "Wordt gemaakt…" : "Alles exporteren"}
        </SectionAction>
      }
    >
      {source.owner
        ? null
        : <p className="text-ink-3 text-sm">Alleen de eigenaar van de werkruimte kan alles exporteren.</p>}
      <fieldset disabled={!source.owner} className="contents">
        <FieldRow label="Automatisch exporteren" hint="Insyte maakt hem 's ochtends; hij verschijnt hieronder.">
          <SelectInput value={draft} onChange={(v) => setDraft(v as ExportSchedule)} options={SCHEDULES} />
        </FieldRow>
      </fieldset>
      {source.requests.exports.length === 0
        ? <p className="rounded-xl bg-mist px-4 py-3 text-ink-2 text-sm">Nog geen exports.</p>
        : (
          <BandedList>
            {source.requests.exports.map((e) => (
              <BandedRow
                key={e.id}
                leading={<Tile icon={Download} tone={e.href === null ? "neutral" : "green"} />}
                title={exportTitle(e)}
                detail={exportDetail(e)}
                trailing={e.href === null ? <StateWord state={e.state} /> : <DownloadLink href={e.href} />}
              />
            ))}
          </BandedList>
        )}
      <UnsavedBar
        visible={draft !== saved && source.owner}
        onDiscard={() => setDraft(saved)}
        onSave={async () => {
          if (await source.setSchedule(draft)) {
            toast.success(
              draft === "off"
                ? "Automatisch exporteren staat uit"
                : `Insyte exporteert ${draft === "weekly" ? "elke week" : "elke maand"}`
            )
          } else {
            throw new Error("not saved")
          }
        }}
      />
    </SettingCard>
  )
}

function Tile({ icon: Icon, tone }: { icon: IconComponent; tone: "neutral" | "green" | "danger" }) {
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-lg",
        tone === "green"
          ? "bg-signal-green-bg text-signal-green"
          : tone === "danger"
          ? "bg-abyss text-mesh-ink"
          : "bg-mist text-ink-2"
      )}
    >
      <Icon className="size-4" strokeWidth={1.75} />
    </span>
  )
}

function DownloadLink({ href, label = "Downloaden" }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      download
      className="field flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink text-sm hover:field-hover"
    >
      <Download className="size-3.5" strokeWidth={1.75} />
      {label}
    </a>
  )
}

function StateWord({ state }: { state: ExportEntry["state"] }) {
  switch (state) {
    case "open":
    case "running":
      return <StatusPill tone="info" label="Bezig" />
    case "failed":
      return <StatusPill tone="danger" label="Mislukt" />
    case "ready":
      return <StatusPill tone="neutral" label="Verlopen" />
    case "done":
      return <StatusPill tone="success" label="Afgehandeld" />
    default:
      return <StatusPill tone="neutral" label="Gestopt" />
  }
}

const shopperDetail = (r: ShopperRequestEntry) => {
  const what = r.kind === "access" ? "Inzage" : "Wissen"
  const via = r.source === "shopify" ? "via Shopify" : "in Insyte"
  const when = r.completedAt !== null
    ? `afgehandeld op ${day(r.completedAt)}`
    : `uiterlijk ${day(r.dueAt)} beantwoorden`
  return `${what} · ${via} · ${when}`
}

function ShopperRequests() {
  const source = useDataSource()
  const [open, setOpen] = useState(false)
  const rows = source.requests.shoppers
  const answer = async (id: string) => {
    if (await source.requestAccess({ requestId: id })) {
      toast.success("Pakket wordt gemaakt", { description: "Het staat bij het verzoek zodra het klaar is." })
    }
  }
  return (
    <SettingCard
      id="requests"
      title="Verzoeken van klanten"
      icon={UserSearch}
      subtitle="Een klant mag vragen wat je over hem bewaart, of dat je het wist. Je hebt daar 30 dagen voor. Verzoeken die via Shopify binnenkomen, staan hier vanzelf."
      action={
        <SectionAction disabled={!source.mayRequestAccess && !source.mayErase} onClick={() => setOpen(true)}>
          Verzoek vastleggen
        </SectionAction>
      }
    >
      {rows.length === 0
        ? <p className="rounded-xl bg-mist px-4 py-3 text-ink-2 text-sm">Nog geen verzoeken van klanten.</p>
        : (
          <BandedList>
            {rows.map((r) => (
              <BandedRow
                key={r.id}
                leading={<Tile icon={r.kind === "access" ? Eye : Trash2} tone="neutral" />}
                title={r.subject ?? "Onbekende klant"}
                detail={shopperDetail(r)}
                trailing={r.href !== null
                  ? <DownloadLink href={r.href} label="Pakket" />
                  : r.kind === "access" && (r.state === "open" || r.state === "failed") && r.source === "shopify"
                  ? (
                    <button
                      type="button"
                      disabled={!source.mayRequestAccess}
                      onClick={() => void answer(r.id)}
                      className="field flex h-8 items-center rounded-md px-2.5 font-medium text-ink text-sm hover:field-hover disabled:opacity-45"
                    >
                      Pakket maken
                    </button>
                  )
                  : r.kind === "erasure" && r.state === "done"
                  ? <StatusPill tone="success" label="Gewist" />
                  : <StateWord state={r.state} />}
              />
            ))}
          </BandedList>
        )}
      <ShopperDialog open={open} onOpenChange={setOpen} />
    </SettingCard>
  )
}

/** "Verzoek vastleggen": a shopper by address, to see what is held or to erase it. Erasing is said for what it is. */
function ShopperDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const source = useDataSource()
  const [kind, setKind] = useState<"access" | "erasure">(source.mayRequestAccess ? "access" : "erasure")
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) {
      setEmail("")
      setKind(source.mayRequestAccess ? "access" : "erasure")
    }
  }, [open, source.mayRequestAccess])
  const valid = /^\S+@\S+\.\S+$/.test(email.trim())
  const may = kind === "access" ? source.mayRequestAccess : source.mayErase
  const go = async () => {
    setBusy(true)
    try {
      const done = kind === "access"
        ? await source.requestAccess({ email: email.trim() })
        : await source.requestErasure(email.trim())
      if (done) {
        onOpenChange(false)
        toast.success(kind === "access" ? "Pakket wordt gemaakt" : "Gegevens van de klant gewist", {
          description: kind === "access"
            ? "Het staat bij het verzoek zodra het klaar is."
            : "Bedragen en datums blijven voor je cijfers; de persoonsgegevens zijn weg."
        })
      }
    } finally {
      setBusy(false)
    }
  }
  const OPTIONS = [
    { id: "access" as const, title: "Inzage", detail: "Alles wat Insyte over de klant bewaart, in één ZIP." },
    {
      id: "erasure" as const,
      title: "Wissen",
      detail: "Naam, adres, telefoon en e-mails van de klant verwijderen. Bedragen en datums blijven."
    }
  ]
  return (
    <Dialog open={open} onOpenChange={(v) => busy || onOpenChange(v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Verzoek van een klant</DialogTitle>
          <DialogDescription>
            Leg vast wat de klant vraagt. Insyte zoekt de klant op e-mailadres in al je winkels.
          </DialogDescription>
        </DialogHeader>
        <div role="radiogroup" aria-label="Wat vraagt de klant" className="flex flex-col gap-1.5">
          {OPTIONS.map((o) => {
            const allowed = o.id === "access" ? source.mayRequestAccess : source.mayErase
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={kind === o.id}
                disabled={!allowed || busy}
                onClick={() => setKind(o.id)}
                className={cn(
                  "flex flex-col rounded-lg px-3 py-2.5 text-left transition-colors disabled:cursor-default disabled:opacity-45",
                  kind === o.id ? "bg-arc-tint" : "bg-mist hover:bg-ink/6"
                )}
              >
                <span className="font-medium text-base text-ink">{o.title}</span>
                <span className="text-ink-2 text-sm">{o.detail}</span>
              </button>
            )
          })}
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="font-medium text-ink-2 text-xs">E-mailadres van de klant</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="naam@voorbeeld.nl"
            className={INPUT_CLASS}
          />
        </label>
        {kind === "erasure"
          ? (
            <p className="rounded-lg bg-signal-red-bg px-3 py-2 text-signal-red text-sm">
              Wissen gebeurt meteen en kan niet ongedaan worden gemaakt.
            </p>
          )
          : null}
        <DialogFooter>
          <button
            type="button"
            disabled={busy}
            onClick={() => onOpenChange(false)}
            className="flex h-9 items-center justify-center rounded-md px-3 font-medium text-base text-ink hover:bg-ink/6 disabled:pointer-events-none disabled:opacity-50"
          >
            Annuleren
          </button>
          <button
            type="button"
            disabled={!valid || !may || busy}
            aria-busy={busy}
            onClick={() => void go()}
            className={cn(
              "flex h-9 items-center justify-center rounded-md px-3 font-medium text-base text-mesh-ink transition active:scale-[0.98] disabled:pointer-events-none disabled:bg-ink/8 disabled:text-ink-3",
              kind === "erasure" ? "bg-signal-red hover:bg-signal-red/90" : "bg-abyss shadow-primary hover:bg-abyss-2"
            )}
          >
            {busy ? "Bezig…" : kind === "erasure" ? "Gegevens wissen" : "Pakket maken"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Deletion() {
  const source = useDataSource()
  const pending = source.requests.deletion
  const [open, setOpen] = useState(false)
  const [stopping, setStopping] = useState(false)
  const stop = async () => {
    setStopping(true)
    try {
      if (await source.cancelDeletion()) toast.success("Verwijderen gestopt", { description: "De werkruimte blijft." })
    } finally {
      setStopping(false)
    }
  }
  return (
    <SettingCard id="delete" title="Werkruimte verwijderen" icon={Trash2}>
      {pending !== null
        ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-signal-amber-bg px-4 py-3">
            <span className="min-w-0 flex-1 text-sm text-ink">
              <span className="font-medium">Deze werkruimte wordt verwijderd op {moment(pending.dueAt)}.</span>{" "}
              <span className="text-ink-2">
                {pending.requestedBy === null ? "Aangevraagd" : `Aangevraagd door ${pending.requestedBy}`} op{" "}
                {day(pending.requestedAt)}. Tot dan werkt alles zoals altijd.
              </span>
            </span>
            <button
              type="button"
              disabled={!source.owner || stopping}
              title={source.owner ? undefined : "Alleen de eigenaar kan dit stoppen"}
              onClick={() => void stop()}
              className="flex h-8 items-center rounded-md bg-abyss px-2.5 font-medium text-mesh-ink text-sm shadow-primary hover:bg-abyss-2 disabled:opacity-45"
            >
              Verwijderen stoppen
            </button>
          </div>
        )
        : (
          <BandedList>
            <BandedRow
              leading={<Tile icon={Trash2} tone="danger" />}
              title="Werkruimte en alles erin verwijderen"
              detail={source.owner
                ? "Na 7 dagen wachten. Tot dan kun je het stoppen; daarna is er geen weg terug."
                : "Alleen de eigenaar van de werkruimte kan dit doen."}
              trailing={
                <button
                  type="button"
                  disabled={!source.owner}
                  onClick={() => setOpen(true)}
                  className="flex h-8 items-center rounded-md bg-signal-red px-2.5 font-medium text-mesh-ink text-sm hover:bg-signal-red/90 disabled:opacity-45"
                >
                  Verwijderen…
                </button>
              }
            />
          </BandedList>
        )}
      <DeletionDialog open={open} onOpenChange={setOpen} />
    </SettingCard>
  )
}

/** The workspace's name typed as it is, so a slip of the hand cannot start it. */
function DeletionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const source = useDataSource()
  const [typed, setTyped] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) setTyped("")
  }, [open])
  const matches = typed.trim() === source.workspaceName.trim()
  const go = async () => {
    setBusy(true)
    try {
      if (await source.requestDeletion(typed)) {
        onOpenChange(false)
        toast("Werkruimte wordt over 7 dagen verwijderd", { description: "Tot die tijd kun je het hier stoppen." })
      }
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={(v) => busy || onOpenChange(v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{source.workspaceName} verwijderen?</DialogTitle>
          <DialogDescription>
            Over 7 dagen verwijdert Insyte de koppelingen met je winkels en diensten, elke bestelling, klant, ticket en
            collega, en alle bestanden. Tot die tijd kun je het stoppen; daarna is er geen weg terug. Maak eerst een
            export als je een kopie wilt.
          </DialogDescription>
        </DialogHeader>
        <label className="flex flex-col gap-1.5">
          <span className="font-medium text-ink-2 text-xs">Typ de naam van de werkruimte</span>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={source.workspaceName}
            autoComplete="off"
            className={INPUT_CLASS}
          />
        </label>
        <DialogFooter>
          <button
            type="button"
            disabled={busy}
            onClick={() => onOpenChange(false)}
            className="flex h-9 items-center justify-center rounded-md px-3 font-medium text-base text-ink hover:bg-ink/6 disabled:pointer-events-none disabled:opacity-50"
          >
            Annuleren
          </button>
          <button
            type="button"
            disabled={!matches || busy}
            aria-busy={busy}
            onClick={() => void go()}
            className="flex h-9 items-center justify-center rounded-md bg-signal-red px-3 font-medium text-base text-mesh-ink transition hover:bg-signal-red/90 active:scale-[0.98] disabled:pointer-events-none disabled:bg-ink/8 disabled:text-ink-3"
          >
            {busy ? "Bezig…" : "Werkruimte verwijderen"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

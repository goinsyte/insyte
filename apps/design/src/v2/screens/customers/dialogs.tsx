import { useEffect, useState } from "react"
import {
  absorbedInto,
  counted,
  COUNTRY,
  customerCounts,
  getCustomerState,
  KLAVIYO_LISTS,
  KNOWN_TAGS,
  MATCH_LABEL,
  ordersOf,
  setCustomerState,
  useCustomerState
} from "../../fixtures/customers.ts"
import type { CustomerRow, CustomerState, DuplicateGroup } from "../../fixtures/customers.ts"
import { CUSTOMERS, euro } from "../../fixtures/records.ts"
import { Avatar } from "../../ui/avatar.tsx"
import { Tag } from "../../ui/badge.tsx"
import { Button } from "../../ui/button.tsx"
import { Checkbox, RadioGroup } from "../../ui/checkbox.tsx"
import { cx } from "../../ui/cx.ts"
import { AlertDialog, Dialog } from "../../ui/dialog.tsx"
import { Check } from "../../ui/icons.tsx"
import { Field, Input } from "../../ui/input.tsx"
import { ServiceLogo } from "../../ui/service-logo.tsx"
import { toast } from "../../ui/toast.tsx"
import { Segmented } from "../../ui/toggle.tsx"
import { useView } from "../../view.ts"

function withUndo(title: string, body: string | undefined, change: (s: CustomerState) => CustomerState) {
  const before = getCustomerState()
  setCustomerState(change)
  toast({
    title,
    ...(body === undefined ? {} : { body }),
    tone: "good",
    action: { label: "Ongedaan maken", onClick: () => setCustomerState(() => before) }
  })
}

/* ── the duplicate review ──────────────────────────────────────────────────────────────────────── */

/**
 * "Is dit dezelfde persoon?", one pair at a time. The profile with the most history is kept by
 * default; a column is picked to keep instead. A line under them says what the merged profile will
 * be before anything is merged. "Niet dezelfde persoon" is an answer too and is not asked again.
 * Merging has Undo; nothing about it is a guess the product made.
 */
export function MergeReview({ open, onClose, groups }: {
  readonly open: boolean
  readonly onClose: () => void
  readonly groups: ReadonlyArray<DuplicateGroup>
}) {
  const view = useView()
  const s = useCustomerState()
  // The queue is fixed when the review opens, so merging one pair does not reshuffle the rest.
  const [queue, setQueue] = useState<ReadonlyArray<DuplicateGroup>>([])
  const [at, setAt] = useState(0)
  const [keep, setKeep] = useState<string | null>(null)
  const [tally, setTally] = useState({ merged: 0, apart: 0 })

  useEffect(() => {
    if (!open) return
    setQueue(groups)
    setAt(0)
    setKeep(null)
    setTally({ merged: 0, apart: 0 })
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- taken once, when the review opens
  }, [open])

  const group = queue[at]
  const members = (group?.ids ?? []).map((id) => CUSTOMERS.find((c) => c.id === id)).filter((c) => c !== undefined)
  const history = (id: string) => ordersOf(id, s).length + (CUSTOMERS.find((c) => c.id === id)?.ordersCount ?? 0)
  const keeper = members.find((c) => c.id === keep) ?? members.toSorted((a, b) => history(b.id) - history(a.id))[0]
  const next = () => {
    setKeep(null)
    setAt((i) => i + 1)
  }

  if (group === undefined || keeper === undefined) {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        size="sm"
        title={queue.length === 0 ? "Geen dubbele profielen om te bekijken" : "Alles bekeken"}
        description={queue.length === 0
          ? "Geen twee profielen delen een e-mailadres, of een naam in hetzelfde land."
          : `${tally.merged} samengevoegd, ${tally.apart} apart gehouden, ${
            queue.length - tally.merged - tally.apart
          } overgeslagen.`}
        footer={<Button variant="primary" onClick={onClose}>Klaar</Button>}
      />
    )
  }

  const others = members.filter((c) => c.id !== keeper.id)
  const totalOrders = members.reduce((n, c) => n + history(c.id), 0)
  const totalValue = members.reduce(
    (n, c) => n + c.lifetimeValue + ordersOf(c.id, s).reduce((v, o) => v + o.total, 0),
    0
  )
  const emails = new Set(members.map((c) => c.email)).size

  const merge = () => {
    withUndo(
      `${members.length} profielen samengevoegd tot ${keeper.name}`,
      "De bestellingen tellen nu op één profiel.",
      (st) => ({ ...st, merged: { ...st.merged, ...Object.fromEntries(others.map((o) => [o.id, keeper.id])) } })
    )
    setTally((t) => ({ ...t, merged: t.merged + 1 }))
    next()
  }
  const apart = () => {
    setCustomerState((st) => ({ ...st, apart: [...st.apart, group.key] }))
    setTally((t) => ({ ...t, apart: t.apart + 1 }))
    next()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Is dit dezelfde persoon?"
      description={
        <span className="flex flex-wrap items-center gap-2">
          <span className="figure">{at + 1} van {queue.length}</span>
          <Tag tone="accent">{MATCH_LABEL[group.match]}</Tag>
        </span>
      }
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" onClick={apart}>Niet dezelfde persoon</Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={next}>Overslaan</Button>
            <Button variant="primary" onClick={merge}>{members.length} profielen samenvoegen</Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4 pb-1">
        <div
          role="radiogroup"
          aria-label="Profiel om te houden"
          className="grid gap-2 sm:grid-cols-2"
        >
          {members.map((c) => {
            const on = c.id === keeper.id
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setKeep(c.id)}
                className={cx(
                  "flex flex-col gap-3 rounded-md p-3 text-left transition-colors",
                  on ? "bg-accent-tint" : "hover:bg-hover"
                )}
              >
                <span className="flex items-center gap-2.5">
                  <Avatar name={c.name} size={30} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium text-ink">{c.name}</span>
                    <span className="truncate text-xs text-ink-3">{c.email}</span>
                  </span>
                </span>
                <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-ink-3">Land</dt>
                  <dd className="truncate text-ink-2">{c.city}, {COUNTRY[c.country]}</dd>
                  <dt className="text-ink-3">Bestellingen</dt>
                  <dd className="figure text-ink-2">{history(c.id)}</dd>
                  <dt className="text-ink-3">Klant sinds</dt>
                  <dd className="text-ink-2">{c.since}</dd>
                </dl>
                <span
                  className={cx(
                    "flex h-5 items-center gap-1 text-xs",
                    on ? "font-medium text-accent-ink" : "text-ink-3"
                  )}
                >
                  {on && <Check size={13} strokeWidth={2.25} />}
                  {on ? "Dit profiel houden" : "Liever dit profiel houden"}
                </span>
              </button>
            )
          })}
        </div>
        <p className="text-sm text-pretty text-ink-2">
          Samengevoegd is dit één profiel: <span className="font-medium text-ink">{keeper.name}</span>,{" "}
          <span className="figure">{totalOrders}</span> {totalOrders === 1 ? "bestelling" : "bestellingen"} en{" "}
          <span className="figure">{euro(Math.round(totalValue))}</span> klantwaarde, met{" "}
          {emails === 1 ? "één e-mailadres" : `${emails} e-mailadressen bewaard`}.
        </p>
        {view.staat === "druk" && (
          <p className="text-xs text-ink-3">
            Nog <span className="figure">{customerCounts(view, s).dubbel}</span> paren te bekijken in deze week.
          </p>
        )}
      </div>
    </Dialog>
  )
}

/* ── labels ────────────────────────────────────────────────────────────────────────────────────── */

export function TagDialog({ open, onClose, picked }: {
  readonly open: boolean
  readonly onClose: () => void
  readonly picked: ReadonlyArray<CustomerRow>
}) {
  const [mode, setMode] = useState<"add" | "remove">("add")
  const [chosen, setChosen] = useState<ReadonlyArray<string>>([])
  const [draft, setDraft] = useState("")
  useEffect(() => {
    if (open) {
      setMode("add")
      setChosen([])
      setDraft("")
    }
  }, [open])
  const toggle = (t: string) => setChosen((all) => (all.includes(t) ? all.filter((x) => x !== t) : [...all, t]))
  const addDraft = () => {
    const t = draft.trim().toLowerCase()
    if (t !== "" && !chosen.includes(t)) setChosen((all) => [...all, t])
    setDraft("")
  }
  const known = [...new Set([...KNOWN_TAGS, ...picked.flatMap((p) => p.tags)])]
  const apply = () => {
    const ids = picked.map((p) => p.id)
    withUndo(
      `${chosen.length === 1 ? `‘${chosen[0] ?? ""}’` : `${chosen.length} labels`} ${
        mode === "add" ? "toegevoegd aan" : "verwijderd van"
      } ${counted(ids.length, "klant", "klanten")}`,
      "Labels gaan mee met het profiel, naar segmenten, automatiseringen en Klaviyo.",
      (s) => ({
        ...s,
        tags: {
          ...s.tags,
          ...Object.fromEntries(picked.map((p) => {
            const now = s.tags[p.id] ?? p.tags
            return [p.id, mode === "add" ? [...new Set([...now, ...chosen])] : now.filter((t) => !chosen.includes(t))]
          }))
        }
      })
    )
    onClose()
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Labels"
      description={`${
        counted(picked.length, "klant", "klanten")
      } gekozen. Labels gaan mee met het profiel, naar segmenten, automatiseringen en Klaviyo.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button variant="primary" disabled={chosen.length === 0} onClick={apply}>
            {mode === "add" ? "Toevoegen" : "Verwijderen"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-1">
        <Segmented
          label="Toevoegen of verwijderen"
          value={mode}
          onChange={setMode}
          options={[{ value: "add", label: "Toevoegen" }, { value: "remove", label: "Verwijderen" }]}
        />
        <div className="flex flex-wrap gap-1.5">
          {known.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={chosen.includes(t)}
              onClick={() => toggle(t)}
              className={cx(
                "inline-flex h-8 items-center gap-1 rounded-sm px-2.5 text-sm transition-colors pointer-coarse:h-11",
                chosen.includes(t) ? "bg-accent-tint text-accent-ink" : "bg-well text-ink-2 hover:bg-hover"
              )}
            >
              {chosen.includes(t) && <Check size={13} />}
              {t}
            </button>
          ))}
        </div>
        <Field label="Nieuw label" optional>
          {(control) => (
            <div className="flex gap-2">
              <Input
                {...control}
                value={draft}
                placeholder="Bijvoorbeeld terugwinnen"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    addDraft()
                  }
                }}
              />
              <Button onClick={addDraft} disabled={draft.trim() === ""}>Erbij</Button>
            </div>
          )}
        </Field>
      </div>
    </Dialog>
  )
}

/* ── Klaviyo ───────────────────────────────────────────────────────────────────────────────────── */

export function KlaviyoDialog({ open, onClose, picked }: {
  readonly open: boolean
  readonly onClose: () => void
  readonly picked: ReadonlyArray<CustomerRow>
}) {
  const [list, setList] = useState<string>(KLAVIYO_LISTS[0])
  const [withTags, setWithTags] = useState(true)
  const sendable = picked.filter((p) => !p.erased)
  const sync = () => {
    withUndo(
      `${counted(sendable.length, "klant", "klanten")} gesynchroniseerd naar ${list}`,
      withTags ? "Labels zijn meegestuurd als profieleigenschappen." : undefined,
      (s) => ({ ...s, klaviyo: { ...s.klaviyo, ...Object.fromEntries(sendable.map((p) => [p.id, list])) } })
    )
    onClose()
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      lead={<ServiceLogo service="klaviyo" name="Klaviyo" size={40} />}
      title="Synchroniseren naar Klaviyo"
      description={`${counted(picked.length, "klant", "klanten")} gekozen`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button variant="primary" disabled={sendable.length === 0} onClick={sync}>
            {counted(sendable.length, "klant", "klanten")} synchroniseren
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-1">
        <RadioGroup
          label="Klaviyo-lijst"
          value={list}
          onChange={setList}
          options={KLAVIYO_LISTS.map((l) => ({ value: l, label: l }))}
        />
        <Checkbox
          checked={withTags}
          onChange={setWithTags}
          label="Labels meesturen als profieleigenschappen"
        />
      </div>
    </Dialog>
  )
}

/* ── a new customer ────────────────────────────────────────────────────────────────────────────── */

export function NewCustomerDialog({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [tried, setTried] = useState(false)
  useEffect(() => {
    if (open) {
      setName("")
      setEmail("")
      setTried(false)
    }
  }, [open])
  const nameError = tried && name.trim() === "" ? "Vul een naam in." : undefined
  const emailError = tried && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? "Vul een geldig e-mailadres in." : undefined
  const create = () => {
    setTried(true)
    if (name.trim() === "" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return
    toast({
      title: `${name.trim()} toegevoegd`,
      body: "Het profiel gaat bij de volgende synchronisatie ook naar Shopify.",
      tone: "good",
      action: { label: "Ongedaan maken", onClick: () => toast({ title: "Profiel weer verwijderd" }) }
    })
    onClose()
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Nieuwe klant"
      description="Voor een klant die niet via de winkel bestelde: een groothandel, een beurs, een telefoonbestelling."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button variant="primary" onClick={create}>Klant toevoegen</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-1">
        <Field label="Naam" error={nameError}>
          {(control) => <Input {...control} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="E-mailadres" error={emailError}>
          {(control) => <Input {...control} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label="Telefoon" optional>
          {(control) => <Input {...control} type="tel" />}
        </Field>
      </div>
    </Dialog>
  )
}

/* ── privacy (AVG) ─────────────────────────────────────────────────────────────────────────────── */

const ACCESS_PARTS = [
  "Profiel en adressen",
  "Bestellingen en retouren",
  "Tickets en e-mails",
  "Notities en labels",
  "Wat de agents met dit profiel deden"
]

/** Inzage: everything Insyte holds on the customer, in one ZIP, attached to the request. */
export function ExportDialog({ open, onClose, row }: {
  readonly open: boolean
  readonly onClose: () => void
  readonly row: CustomerRow
}) {
  const [busy, setBusy] = useState(false)
  const make = () => {
    setBusy(true)
    window.setTimeout(() => {
      setBusy(false)
      onClose()
      toast({
        title: `Inzage voor ${row.name} klaar`,
        body: "Het staat bij het verzoek zodra het klaar is, als ZIP met een link die 7 dagen werkt.",
        tone: "good"
      })
    }, 900)
  }
  return (
    <Dialog
      open={open}
      onClose={() => busy || onClose()}
      title="Inzage in persoonsgegevens"
      description={`Alles wat Insyte over ${row.name} bewaart, in één ZIP. Je hebt een maand om een verzoek te beantwoorden.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Annuleren</Button>
          <Button variant="primary" loading={busy} onClick={make}>ZIP maken</Button>
        </>
      }
    >
      <ul className="flex flex-col gap-1.5 pb-1 text-sm text-ink-2">
        {ACCESS_PARTS.map((p) => (
          <li key={p} className="flex items-center gap-2">
            <Check size={14} className="shrink-0 text-ink-3" />
            {p}
          </li>
        ))}
      </ul>
    </Dialog>
  )
}

/** Wissen: the personal data goes, amounts and dates stay. It cannot be undone, so it asks first. */
export function EraseDialog({ open, onClose, row }: {
  readonly open: boolean
  readonly onClose: () => void
  readonly row: CustomerRow
}) {
  const s = useCustomerState()
  const others = absorbedInto(row.id, s)
  return (
    <AlertDialog
      open={open}
      onCancel={onClose}
      onConfirm={() => {
        setCustomerState((st) => ({ ...st, erased: [...st.erased, row.id, ...others.map((o) => o.id)] }))
        onClose()
        toast({
          title: "Persoonsgegevens gewist",
          body: "Bedragen en datums blijven voor je cijfers; de persoonsgegevens zijn weg."
        })
      }}
      title={`Gegevens van ${row.name} wissen?`}
      body={
        <>
          Naam, adres, telefoon en e-mails van de klant worden verwijderd, ook in Shopify en Klaviyo. Bedragen en datums
          blijven. Dit kan niet ongedaan worden gemaakt.
        </>
      }
      confirmLabel="Gegevens wissen"
    />
  )
}

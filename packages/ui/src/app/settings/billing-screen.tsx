import { canRole } from "@insyte/domain/Permissions"
import { type ReactElement, useEffect, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../../components/dialog"
import { Check, CreditCard, Download } from "../../icons"
import { Blocked } from "../access/blocked"
import { useGateRole } from "../access/gate-role"
import { PageGuide } from "../common/page-guide"
import { type Level, type Permission, permissionName } from "../lib/permissions"
import { cn } from "../lib/utils"
import {
  type BillingAsk,
  type BillingCycle,
  type CancelReason,
  type InvoiceRow,
  type PlanTier,
  useBillingSource
} from "./billing-source"
import { Field, INPUT_CLASS } from "./form"
import { SettingCard, StatusPill } from "./setting-card"

/*
 * Instellingen → Facturatie, as the design draws it, over `billing-source.tsx`: the design app's stores with Ongedaan
 * maken, or the console's `Billing.*` (M13 step 1), where a plan or a seat is previewed with what it costs before it is
 * confirmed, because it is charged.
 */

const TIERS: Record<PlanTier, { name: string; pitch: string }> = {
  starter: { name: "Starter", pitch: "Eén winkel en een klein team." },
  growth: { name: "Growth", pitch: "Een paar winkels en een supportteam." },
  scale: { name: "Scale", pitch: "Elke winkel, elk kanaal, het hele team." }
}
const TIER_ORDER: Array<PlanTier> = ["starter", "growth", "scale"]

/**
 * A control the host's role may not use (the design's access store, the console's frame): there, disabled, naming what
 * is missing. The server refuses it either way.
 */
function Gate({ perm, arg, children }: { perm: Permission; arg?: Level; children: ReactElement }) {
  const role = useGateRole()
  if (role === null || canRole(role, perm, arg)) return children
  return <Blocked reason={`Je rol ${role.label} mist ${permissionName(perm, arg)}`}>{children}</Blocked>
}

const SECONDARY =
  "flex h-8 items-center gap-2 rounded-md bg-paper px-3 py-1.5 font-medium text-base text-ink hover:bg-mist disabled:pointer-events-none disabled:opacity-45"
const PRIMARY =
  "flex h-9 items-center justify-center rounded-md bg-abyss px-3 font-medium text-base text-mesh-ink shadow-primary transition hover:bg-abyss-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45"
const GHOST = "flex h-9 items-center justify-center rounded-md px-3 font-medium text-base text-ink hover:bg-ink/6"

export function BillingPage() {
  const source = useBillingSource()
  const [changing, setChanging] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [updatingCard, setUpdatingCard] = useState(false)

  const guide = [
    {
      title: "Extra plekken",
      body: "Een extra plek gaat naar rato op je volgende factuur en stopt wanneer je hem opzegt.",
      art: "people"
    },
    {
      title: "Automatisch afgeschreven",
      body: "Aan het einde van elke periode wordt automatisch afgeschreven van de opgeslagen kaart.",
      art: "budget"
    },
    { title: "Abonnement wijzigen", body: source.changeNote, art: "chart" }
  ] as const

  return (
    <>
      <SettingCard
        id="plekken"
        title="Abonnement"
        action={
          <Gate perm="billing" arg={3}>
            <button type="button" onClick={() => setChanging(true)} className={SECONDARY}>
              Abonnement wijzigen
            </button>
          </Gate>
        }
      >
        <div className="flex items-end justify-between rounded-xl bg-mist p-5">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-2xl text-ink leading-[1.2]">{source.name}</h3>
              <StatusPill tone={source.pill.tone} label={source.pill.label} />
            </div>
            <p className="font-normal text-base text-ink-3 tabular-nums leading-[1.6]">{source.line}</p>
          </div>
          {source.cancelling
            ? (
              <Gate perm="billing" arg={3}>
                <button
                  type="button"
                  onClick={() => void source.resume()}
                  className="font-medium text-base text-ink hover:underline disabled:opacity-45"
                >
                  Abonnement hervatten
                </button>
              </Gate>
            )
            : source.cancellable
            ? (
              <Gate perm="billing" arg={3}>
                <button
                  type="button"
                  onClick={() => setCancelling(true)}
                  className="font-medium text-base text-signal-red hover:underline disabled:opacity-45"
                >
                  Abonnement opzeggen
                </button>
              </Gate>
            )
            : null}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {source.usage.map((u) => (
            <div key={u.label} className="flex flex-col gap-2 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <span className="font-normal text-base text-ink-2 leading-[1.55]">{u.label}</span>
                <span className="font-medium text-base text-ink tabular-nums leading-[1.6]">
                  {u.value.toLocaleString("nl-NL")} / {u.max.toLocaleString("nl-NL")}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-mist">
                <div
                  className={cn("h-full rounded-full", u.value > u.max ? "bg-signal-red" : "bg-abyss")}
                  style={{ width: `${Math.min(100, (u.value / u.max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <ExtraSeats />
      </SettingCard>

      <SettingCard
        title="Betaalmethode"
        action={source.card === null ? undefined : (
          <Gate perm="billing" arg={3}>
            <button
              type="button"
              onClick={() => (source.openCardPage === undefined ? setUpdatingCard(true) : source.openCardPage())}
              className={SECONDARY}
            >
              Kaart bijwerken
            </button>
          </Gate>
        )}
      >
        <div className="flex items-center gap-3 rounded-xl p-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-arc-tint">
            <CreditCard className="size-5 text-arc-ink" strokeWidth={1.75} />
          </span>
          {source.card === null
            ? (
              <div className="flex flex-col">
                <p className="font-medium text-base text-ink leading-[1.4]">Nog geen betaalmethode</p>
                <p className="font-normal text-sm text-ink-3 leading-[1.4]">
                  Je vult je kaart in bij je eerste betaling.
                </p>
              </div>
            )
            : (
              <div className="flex flex-col">
                <p className="font-medium text-base text-ink tabular-nums leading-[1.4]">
                  {source.card.brand} eindigend op {source.card.last4}
                </p>
                <p className="font-normal text-sm text-ink-3 tabular-nums leading-[1.4]">
                  Verloopt {source.card.expiry}
                </p>
              </div>
            )}
        </div>
      </SettingCard>

      {source.invoices === null ? null : <Invoices invoices={source.invoices} />}

      <PlanDialog open={changing} onOpenChange={setChanging} />
      <CancelDialog open={cancelling} onOpenChange={setCancelling} />
      <CardDialog open={updatingCard} onOpenChange={setUpdatingCard} />
      <PageGuide id="settings.billing" title="Facturatie" steps={guide} />
    </>
  )
}

/**
 * A change's price before it is made, where the host can say it (the console asks Stripe): `undefined` while it is
 * asked, `null` where it cannot be said.
 */
function useQuote(ask: BillingAsk | null) {
  const source = useBillingSource()
  const [quote, setQuote] = useState<string | null | undefined>(undefined)
  // The host's latest `quote`, read when the ask changes: the ask by its value, so a new object for the same change
  // (every render) asks once.
  const latest = useRef(source.quote)
  latest.current = source.quote
  const key = ask === null ? null : JSON.stringify(ask)
  useEffect(() => {
    const asking = latest.current
    if (asking === undefined || key === null) return
    let live = true
    setQuote(undefined)
    void asking(JSON.parse(key) as BillingAsk).then((q) => {
      if (live) setQuote(q)
    })
    return () => {
      live = false
    }
  }, [key])
  return source.quote === undefined || ask === null ? null : quote
}

/** Three tiers side by side, and the cycle above them; picking one only changes the card once confirmed. */
function PlanDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const source = useBillingSource()
  const plan = source.plan
  const cycle = source.cycle
  const [pick, setPick] = useState<PlanTier>(plan ?? "growth")
  const [pickCycle, setPickCycle] = useState<BillingCycle>(cycle)
  const [busy, setBusy] = useState(false)
  // On a trial the plan picked at the start is not paid for yet: confirming it is the first payment.
  const unchanged = source.cancellable && pick === plan && pickCycle === cycle
  const quote = useQuote(open && !unchanged ? { kind: "plan", tier: pick, cycle: pickCycle } : null)
  // Each opening starts from the plan as it stands, not from the last visit's choice.
  useEffect(() => {
    if (!open) return
    setPick(plan ?? "growth")
    setPickCycle(cycle)
  }, [open, plan, cycle])

  async function confirm() {
    setBusy(true)
    const took = await source.change({ kind: "plan", tier: pick, cycle: pickCycle })
    setBusy(false)
    if (took) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Abonnement wijzigen</DialogTitle>
          <DialogDescription>{source.changeNote}</DialogDescription>
        </DialogHeader>
        <div role="radiogroup" aria-label="Factuurperiode" className="flex self-start rounded-lg bg-mist p-0.5">
          {(["monthly", "annual"] as const).map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={pickCycle === c}
              onClick={() => setPickCycle(c)}
              className={cn(
                "flex h-7 items-center rounded-md px-3 font-medium text-sm transition-colors",
                pickCycle === c ? "bg-paper text-ink shadow-xs" : "text-ink-3 hover:text-ink"
              )}
            >
              {c === "monthly" ? "Maandelijks" : "Jaarlijks"}
            </button>
          ))}
        </div>
        <div role="radiogroup" aria-label="Abonnement" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {TIER_ORDER.map((t) => {
            const info = source.tiers[t]
            const selected = pick === t
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setPick(t)}
                className={cn(
                  "flex flex-col gap-2 rounded-xl p-4 text-left transition-colors",
                  selected ? "bg-arc-tint" : "bg-mist hover:bg-ink/6"
                )}
              >
                <span className="flex items-center justify-between">
                  <span className="font-medium text-base text-ink">{TIERS[t].name}</span>
                  {selected ? <Check className="size-4 text-arc-ink" strokeWidth={2} /> : null}
                </span>
                <span className="font-medium text-2xl text-ink tabular-nums leading-none">
                  {info.price(pickCycle) ?? "–"}
                  <span className="font-normal text-sm text-ink-3">{" /maand"}</span>
                </span>
                <span className="text-sm text-ink-2 tabular-nums leading-snug">
                  {info.seats} plekken · {info.stores} {info.stores === 1 ? "winkel" : "winkels"} ·{" "}
                  {info.replies.toLocaleString("nl-NL")} AI-antwoorden
                </span>
                <span className="text-sm text-ink-3 leading-snug">{TIERS[t].pitch}</span>
                {t === plan ? <span className="font-medium text-xs text-ink-3">Huidig abonnement</span> : null}
              </button>
            )
          })}
        </div>
        {source.quote === undefined || unchanged ?
          null :
          (
            <p aria-live="polite" className="text-base text-ink-2 tabular-nums leading-[1.55]">
              {quote === undefined ? "Bedrag berekenen…" : quote ?? "Het bedrag is nu niet op te halen."}
            </p>
          )}
        <DialogFooter>
          <button type="button" onClick={() => onOpenChange(false)} className={GHOST}>
            Annuleren
          </button>
          <button
            type="button"
            disabled={unchanged || busy || (source.quote !== undefined && (quote === undefined || quote === null))}
            onClick={() => void confirm()}
            className={PRIMARY}
          >
            {source.cancellable ? `Overstappen naar ${TIERS[pick].name}` : `Abonneren op ${TIERS[pick].name}`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const REASONS: ReadonlyArray<readonly [CancelReason, string]> = [
  ["too_expensive", "Het is te duur"],
  ["missing_feature", "We missen een functie"],
  ["closing_store", "We sluiten de winkel"],
  ["switched_tool", "We zijn overgestapt op een andere tool"],
  ["other", "Iets anders"]
]

function CancelDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const source = useBillingSource()
  const [reason, setReason] = useState<CancelReason | null>(null)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) return
    setReason(null)
    setNote("")
  }, [open])

  async function confirm() {
    if (reason === null) return
    setBusy(true)
    const took = await source.cancel(reason, note)
    setBusy(false)
    if (took) onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{source.name} opzeggen?</DialogTitle>
          <DialogDescription>
            Je abonnement blijft actief tot {source.periodEnd},{" "}
            {source.afterEnd}. Tot die datum kun je altijd hervatten.
          </DialogDescription>
        </DialogHeader>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1.5 font-medium text-xs text-ink-2">Waarom stop je?</legend>
          {REASONS.map(([id, label]) => (
            <label
              key={id}
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-base text-ink hover:bg-ink/3"
            >
              <input
                type="radio"
                name="cancel-reason"
                checked={reason === id}
                onChange={() => setReason(id)}
                className="size-4 accent-[var(--abyss)]"
              />
              {label}
            </label>
          ))}
        </fieldset>
        <Field label="Wil je ons nog iets laten weten? (optioneel)">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={2000}
            className={cn(INPUT_CLASS, "h-auto resize-none py-2")}
          />
        </Field>
        <DialogFooter>
          <button type="button" onClick={() => onOpenChange(false)} className={GHOST}>
            Abonnement houden
          </button>
          <button
            type="button"
            disabled={!reason || busy}
            onClick={() => void confirm()}
            className="flex h-9 items-center justify-center rounded-md bg-signal-red px-3 font-medium text-base text-mesh-ink transition hover:bg-signal-red/90 disabled:pointer-events-none disabled:opacity-45"
          >
            Abonnement opzeggen
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const digits = (s: string) => s.replace(/\D/g, "")

/** The Luhn check every card number carries, so a typo is caught before it is "saved". */
function luhn(num: string) {
  let sum = 0
  for (let i = 0; i < num.length; i++) {
    let d = Number(num[num.length - 1 - i])
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0
}

function brandOf(num: string) {
  if (num.startsWith("4")) return "Visa"
  if (/^(5[1-5]|2[2-7])/.test(num)) return "Mastercard"
  if (/^3[47]/.test(num)) return "Amex"
  return "Kaart"
}

/** The design's card form, where the host keeps the card itself (the demo); the console sends it to Stripe's page. */
function CardDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const source = useBillingSource()
  const card = source.card
  const [number, setNumber] = useState("")
  const [expiry, setExpiry] = useState("")
  const [cvc, setCvc] = useState("")
  const [tried, setTried] = useState(false)
  useEffect(() => {
    if (!open) return
    setNumber("")
    setExpiry("")
    setCvc("")
    setTried(false)
  }, [open])

  const num = digits(number)
  const amex = /^3[47]/.test(num)
  const [mm, yy] = [Number(digits(expiry).slice(0, 2)), Number(digits(expiry).slice(2, 4))]
  const now = new Date()
  const expired = 2000 + yy < now.getFullYear() || (2000 + yy === now.getFullYear() && mm < now.getMonth() + 1)
  const errors = {
    number: num.length < (amex ? 15 : 16) || !luhn(num) ? "Vul een geldig kaartnummer in" : null,
    expiry: digits(expiry).length !== 4 || mm < 1 || mm > 12
      ? "Gebruik MM/JJ"
      : expired
      ? "Deze kaart is verlopen"
      : null,
    cvc: digits(cvc).length < (amex ? 4 : 3) ? `${amex ? "4" : "3"} cijfers op de kaart` : null
  }
  const valid = !errors.number && !errors.expiry && !errors.cvc

  function save() {
    setTried(true)
    if (!valid) return
    source.saveCard?.({
      brand: brandOf(num),
      last4: num.slice(-4),
      expiry: `${String(mm).padStart(2, "0")}/20${String(yy).padStart(2, "0")}`
    })
    onOpenChange(false)
  }

  if (card === null) return null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Kaart bijwerken</DialogTitle>
          <DialogDescription>
            Vervangt {card.brand} eindigend op {card.last4}. Deze demo bewaart alleen de laatste vier cijfers.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <CardField label="Kaartnummer" error={tried ? errors.number : null}>
            <input
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="4242 4242 4242 4242"
              value={number}
              // Grouped in fours as it is typed, the way it is printed on the card.
              onChange={(e) => setNumber(digits(e.target.value).slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 "))}
              className={cn(INPUT_CLASS, "tabular-nums")}
            />
          </CardField>
          <div className="grid grid-cols-2 gap-3">
            <CardField label="Vervaldatum" error={tried ? errors.expiry : null}>
              <input
                inputMode="numeric"
                autoComplete="cc-exp"
                placeholder="MM/JJ"
                value={expiry}
                onChange={(e) => {
                  const d = digits(e.target.value).slice(0, 4)
                  setExpiry(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d)
                }}
                className={cn(INPUT_CLASS, "tabular-nums")}
              />
            </CardField>
            <CardField label="CVC" error={tried ? errors.cvc : null}>
              <input
                inputMode="numeric"
                autoComplete="cc-csc"
                placeholder="123"
                type="password"
                value={cvc}
                onChange={(e) => setCvc(digits(e.target.value).slice(0, 4))}
                className={cn(INPUT_CLASS, "tabular-nums")}
              />
            </CardField>
          </div>
          <DialogFooter>
            <button type="button" onClick={() => onOpenChange(false)} className={GHOST}>
              Annuleren
            </button>
            <button type="submit" className={PRIMARY}>
              Kaart opslaan
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CardField({ label, error, children }: { label: string; error: string | null; children: React.ReactNode }) {
  return (
    <Field label={label}>
      {children}
      {error ? <span className="text-signal-red text-xs">{error}</span> : null}
    </Field>
  )
}

function HeaderCell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center px-4 py-3 font-medium text-base text-ink-3 leading-[1.2] tracking-[-0.028px]",
        className
      )}
    >
      {children}
    </div>
  )
}

/*
 * Seats beyond the plan, one at a time. The team page sends a full workspace here (`#plekken`). Where the host can
 * say what a seat costs (the console), buying or giving one up is confirmed with that amount first.
 */
function ExtraSeats() {
  const source = useBillingSource()
  const seats = source.seats
  const [asking, setAsking] = useState<number | null>(null)
  const add = (n: number) => {
    if (source.quote === undefined) void source.change({ kind: "seats", delta: n })
    else setAsking(n)
  }
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3",
        seats.full ? "bg-signal-amber-bg" : "bg-mist"
      )}
    >
      <span className="min-w-0 font-medium text-base text-ink">
        {seats.full ? "Alle plekken zijn bezet" : "Plekken"} · {seats.included} in je abonnement
        {seats.extra > 0 ? ` (+ ${seats.extra} extra)` : ""}
      </span>
      <div className="flex items-center gap-1.5">
        <Gate perm="billing" arg={3}>
          <button
            type="button"
            onClick={() => add(-1)}
            disabled={seats.extra === 0 || seats.free === 0}
            className={cn(GHOST, "disabled:pointer-events-none disabled:opacity-45")}
          >
            Plek opzeggen
          </button>
        </Gate>
        <Gate perm="billing" arg={3}>
          <button type="button" onClick={() => add(1)} className={PRIMARY}>
            Plek bijkopen
          </button>
        </Gate>
      </div>
      <SeatDialog delta={asking} onClose={() => setAsking(null)} />
    </div>
  )
}

/** A seat bought or given up, with what it costs for the rest of the period, confirmed before it is charged. */
function SeatDialog({ delta, onClose }: { delta: number | null; onClose: () => void }) {
  const source = useBillingSource()
  const quote = useQuote(delta === null ? null : { kind: "seats", delta })
  const [busy, setBusy] = useState(false)
  const buying = (delta ?? 0) > 0

  async function confirm() {
    if (delta === null) return
    setBusy(true)
    const took = await source.change({ kind: "seats", delta })
    setBusy(false)
    if (took) onClose()
  }

  return (
    <Dialog open={delta !== null} onOpenChange={(v) => (v ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{buying ? "Plek bijkopen?" : "Extra plek opzeggen?"}</DialogTitle>
          <DialogDescription aria-live="polite" className="tabular-nums">
            {quote === undefined ? "Bedrag berekenen…" : quote ?? "Het bedrag is nu niet op te halen."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button type="button" onClick={onClose} className={GHOST}>
            Annuleren
          </button>
          <button
            type="button"
            disabled={busy || quote === undefined || quote === null}
            onClick={() => void confirm()}
            className={PRIMARY}
          >
            {buying ? "Plek bijkopen" : "Plek opzeggen"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Facturen: the table, and the next page where there is one. */
function Invoices({ invoices }: { invoices: ReadonlyArray<InvoiceRow> }) {
  const source = useBillingSource()
  return (
    <SettingCard title="Facturen">
      <div className="overflow-hidden rounded-xl ">
        <div className="flex items-stretch border-hairline border-b bg-mist">
          <HeaderCell className="w-[160px]">Factuur</HeaderCell>
          <HeaderCell className="flex-1">Datum</HeaderCell>
          <HeaderCell className="w-[110px]">Bedrag</HeaderCell>
          <HeaderCell className="w-[110px]">Status</HeaderCell>
          <HeaderCell className="w-[60px]">{" "}</HeaderCell>
        </div>
        {invoices.length === 0
          ? (
            <div className="flex items-center bg-paper px-4 py-3 font-normal text-base text-ink-3">
              Nog geen facturen. Je eerste staat hier na je eerste betaling.
            </div>
          )
          : null}
        {invoices.map((inv, i) => (
          <div
            key={inv.id}
            className={cn(
              "flex items-stretch bg-paper",
              i < invoices.length - 1 && "border-hairline border-b"
            )}
          >
            <div className="flex w-[160px] items-center px-4 py-3 font-medium text-base text-ink tabular-nums">
              {inv.number}
            </div>
            <div className="flex flex-1 items-center px-4 py-3 font-normal text-base text-ink-3 tabular-nums">
              {inv.date}
            </div>
            <div className="flex w-[110px] items-center px-4 py-3 font-normal text-base text-ink tabular-nums">
              {inv.amount}
            </div>
            <div className="flex w-[110px] items-center px-4 py-3">
              <StatusPill tone={inv.status.tone} label={inv.status.label} />
            </div>
            <div className="flex w-[60px] items-center justify-center px-2 py-3">
              <Gate perm="billing.invoices">
                <button
                  type="button"
                  aria-label={`${inv.number} downloaden`}
                  onClick={() => source.openInvoice(inv)}
                  className="flex size-7 items-center justify-center rounded-md text-ink-3 hover:bg-mist hover:text-ink disabled:opacity-40"
                >
                  <Download className="size-4" strokeWidth={1.75} />
                </button>
              </Gate>
            </div>
          </div>
        ))}
      </div>
      {source.moreInvoices === undefined ?
        null :
        (
          <button type="button" onClick={source.moreInvoices} className={cn(SECONDARY, "self-start")}>
            Meer facturen
          </button>
        )}
    </SettingCard>
  )
}

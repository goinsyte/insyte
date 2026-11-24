import { useState } from "react"
import { CHANNEL_LABEL, nextCaseNumber, openCase, restoreCases } from "../../fixtures/chargebacks.ts"
import type { Channel } from "../../fixtures/chargebacks.ts"
import { customerOrders, CUSTOMERS } from "../../fixtures/records.ts"
import { ME } from "../../fixtures/workspace.ts"
import { navigate, paths } from "../../router.tsx"
import { undoable } from "../../ui/acts.ts"
import { Button } from "../../ui/button.tsx"
import { Dialog } from "../../ui/dialog.tsx"
import { Field, Input, Select, Textarea } from "../../ui/input.tsx"
import { ServiceLogo } from "../../ui/service-logo.tsx"

/** What a provider gives as the reason, in the words the team uses. */
const REASONS = [
  "Niet-geautoriseerde transactie",
  "Artikel niet ontvangen",
  "Verkeerd artikel verzonden",
  "Niet zoals beschreven",
  "Terugbetaling niet ontvangen",
  "Dubbel afgeschreven",
  "Betalingsgeschil"
] as const

const CHANNELS: ReadonlyArray<Channel> = ["klarna", "paypal", "stripe"]

type Form = {
  readonly id: string
  readonly channel: Channel
  readonly customerId: string
  readonly orderNumber: string
  readonly amount: string
  readonly reason: string
  readonly note: string
}

const amountOf = (v: string) => Number(v.replace(/\./g, "").replace(",", "."))

/**
 * A chargeback logged by hand: one a provider announced by letter or a bank by phone, before (or
 * instead of) its webhook. The case opens waiting on evidence, 14 days to the deadline.
 */
export function NewCaseDialog({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Nieuwe chargeback"
      description="Leg een geschil vast dat niet vanzelf binnenkwam. De deadline staat op 14 dagen; daarna kan de Chargeback-assistent het bewijs verzamelen."
      size="lg"
    >
      {open && <NewCaseForm onDone={onClose} />}
    </Dialog>
  )
}

function NewCaseForm({ onDone }: { readonly onDone: () => void }) {
  const [form, setForm] = useState<Form>({
    id: "",
    channel: "klarna",
    customerId: "",
    orderNumber: "",
    amount: "",
    reason: REASONS[0],
    note: ""
  })
  const [tried, setTried] = useState(false)
  const orders = form.customerId === "" ? [] : customerOrders(form.customerId)
  const errors = {
    id: form.id.trim() === "" || /^cb-?\d{3,}$/i.test(form.id.trim()) ? undefined : "Een zaaknummer is CB- met cijfers",
    customer: form.customerId === "" ? "Kies de klant" : undefined,
    order: form.orderNumber === "" ? "Kies de bestelling" : undefined,
    amount: Number.isFinite(amountOf(form.amount)) && amountOf(form.amount) > 0
      ? undefined
      : "Vul het betwiste bedrag in"
  }
  const wrong = Object.values(errors).some((e) => e !== undefined)

  const submit = () => {
    setTried(true)
    if (wrong) return
    const { before, created } = openCase({
      id: form.id,
      channel: form.channel,
      customerId: form.customerId,
      orderNumber: form.orderNumber,
      amount: amountOf(form.amount),
      reason: form.reason,
      note: form.note,
      by: ME.name
    })
    onDone()
    navigate(paths.chargeback(created.id))
    undoable(`${created.id} aangemaakt`, () => {
      restoreCases(before)
      navigate(paths.chargebacks)
    }, `Wacht op bewijs; ${CHANNEL_LABEL[created.channel]} wil binnen 14 dagen antwoord.`)
  }

  return (
    <form
      className="flex flex-col gap-4 pb-2"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Zaaknummer"
          optional
          hint={`Leeg laten geeft ${nextCaseNumber()}.`}
          error={tried ? errors.id : undefined}
        >
          {(c) => (
            <Input
              {...c}
              autoFocus
              value={form.id}
              placeholder={nextCaseNumber()}
              onChange={(e) => setForm({ ...form, id: e.target.value })}
            />
          )}
        </Field>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="pb-1.5 text-xs font-medium text-ink">Aanbieder</legend>
          <div className="flex gap-1.5">
            {CHANNELS.map((ch) => (
              <button
                key={ch}
                type="button"
                aria-pressed={form.channel === ch}
                onClick={() => setForm({ ...form, channel: ch })}
                className={form.channel === ch
                  ? "inline-flex h-8 items-center gap-1.5 rounded-sm bg-selected px-2.5 text-sm font-medium text-ink ring-1 ring-line-strong pointer-coarse:h-11"
                  : "inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-sm text-ink-2 hover:bg-hover hover:text-ink pointer-coarse:h-11"}
              >
                <ServiceLogo service={ch} name={CHANNEL_LABEL[ch]} size={16} bare />
                {CHANNEL_LABEL[ch]}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Klant" error={tried ? errors.customer : undefined}>
          {(c) => (
            <Select
              {...c}
              value={form.customerId}
              onChange={(e) => {
                const id = e.target.value
                const first = id === "" ? undefined : customerOrders(id)[0]
                setForm({
                  ...form,
                  customerId: id,
                  orderNumber: first?.number ?? "",
                  amount: first === undefined
                    ? form.amount
                    : first.total.toLocaleString("nl-NL", { minimumFractionDigits: 2 })
                })
              }}
            >
              <option value="">Kies een klant</option>
              {CUSTOMERS.filter((x) => x.duplicateOf === undefined && x.ordersCount > 0).map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Bestelling" error={tried ? errors.order : undefined}>
          {(c) => (
            <Select
              {...c}
              value={form.orderNumber}
              disabled={orders.length === 0}
              onChange={(e) => {
                const o = orders.find((x) => x.number === e.target.value)
                setForm({
                  ...form,
                  orderNumber: e.target.value,
                  amount: o === undefined ? form.amount : o.total.toLocaleString("nl-NL", { minimumFractionDigits: 2 })
                })
              }}
            >
              {orders.length === 0 && <option value="">Kies eerst de klant</option>}
              {orders.map((o) => <option key={o.number} value={o.number}>#{o.number}</option>)}
            </Select>
          )}
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Betwist bedrag" error={tried ? errors.amount : undefined}>
          {(c) => (
            <Input
              {...c}
              prefix="€"
              inputMode="decimal"
              value={form.amount}
              placeholder="0,00"
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          )}
        </Field>
        <Field label="Reden">
          {(c) => (
            <Select {...c} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
              {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          )}
        </Field>
      </div>
      <Field label="Wat de aanbieder doorgaf" optional hint="De woorden van de klant, als je ze hebt.">
        {(c) => (
          <Textarea
            {...c}
            rows={3}
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        )}
      </Field>
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onDone}>Annuleren</Button>
        <Button variant="primary" type="submit">Zaak aanmaken</Button>
      </div>
    </form>
  )
}

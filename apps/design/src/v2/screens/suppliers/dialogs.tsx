import { useEffect, useState } from "react"
import { getSupplierState, PORTAL_SCOPES, setSupplierState } from "../../fixtures/suppliers.ts"
import type { SupplierRow, SupplierState } from "../../fixtures/suppliers.ts"
import { navigate, paths } from "../../router.tsx"
import { Button } from "../../ui/button.tsx"
import { Checkbox } from "../../ui/checkbox.tsx"
import { Dialog } from "../../ui/dialog.tsx"
import { Field, Input, Textarea } from "../../ui/input.tsx"
import { toast } from "../../ui/toast.tsx"
import { Segmented } from "../../ui/toggle.tsx"

/** Change the demo's suppliers and offer the way back in the toast. */
export function withUndo(title: string, body: string | undefined, change: (s: SupplierState) => SupplierState) {
  const before = getSupplierState()
  setSupplierState(change)
  toast({
    title,
    ...(body === undefined ? {} : { body }),
    tone: "good",
    action: { label: "Ongedaan maken", onClick: () => setSupplierState(() => before) }
  })
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Leverancier uitnodigen: a new supplier gets a link to the portal; how orders reach them and what
 * they see are set here and can change later on their page. Customer contact details never go along.
 */
export function InviteDialog({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }) {
  const [company, setCompany] = useState("")
  const [contact, setContact] = useState("")
  const [email, setEmail] = useState("")
  const [via, setVia] = useState<"portaal" | "email">("portaal")
  const [scopes, setScopes] = useState<ReadonlyArray<string>>(PORTAL_SCOPES.map((s) => s.id))
  const [tried, setTried] = useState(false)
  useEffect(() => {
    if (open) {
      setCompany("")
      setContact("")
      setEmail("")
      setVia("portaal")
      setScopes(PORTAL_SCOPES.map((s) => s.id))
      setTried(false)
    }
  }, [open])
  const errors = {
    company: company.trim() === "" ? "Bedrijfsnaam is verplicht" : undefined,
    email: email.trim() === ""
      ? "E-mailadres is verplicht"
      : !EMAIL.test(email.trim())
      ? "Dit is geen e-mailadres"
      : undefined
  }
  const send = () => {
    setTried(true)
    if (errors.company !== undefined || errors.email !== undefined) return
    toast({
      title: `Uitnodiging verstuurd naar ${company.trim()}`,
      body: `${email.trim()} krijgt een link die 14 dagen geldig is.`,
      tone: "good"
    })
    onClose()
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Leverancier uitnodigen"
      description="Ze krijgen een link naar het leveranciersportaal. Wat ze zien kun je later per leverancier aanpassen."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button variant="primary" onClick={send}>Uitnodiging versturen</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-1">
        <Field label="Bedrijfsnaam" error={tried ? errors.company : undefined}>
          {(control) => <Input {...control} value={company} onChange={(e) => setCompany(e.target.value)} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contactpersoon" optional>
            {(control) => <Input {...control} value={contact} onChange={(e) => setContact(e.target.value)} />}
          </Field>
          <Field label="E-mail" error={tried ? errors.email : undefined}>
            {(control) => <Input {...control} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
          </Field>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink">Bestellingen gaan naar ze via</span>
          <Segmented
            label="Bestellingen gaan naar ze via"
            value={via}
            onChange={setVia}
            options={[{ value: "portaal", label: "Portaal" }, { value: "email", label: "E-mail" }]}
          />
          <span className="text-xs text-ink-3">Een API-koppeling zetten ze zelf op vanuit het portaal.</span>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-xs font-medium text-ink">In het portaal zien ze</legend>
          {PORTAL_SCOPES.map((s) => (
            <Checkbox
              key={s.id}
              checked={s.fixed === true || scopes.includes(s.id)}
              onChange={() =>
                s.fixed === true
                || setScopes((all) => (all.includes(s.id) ? all.filter((x) => x !== s.id) : [...all, s.id]))}
              label={s.fixed === true ? `${s.label} (altijd)` : s.label}
            />
          ))}
        </fieldset>
      </div>
    </Dialog>
  )
}

const slug = (name: string) =>
  name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(
    /^-|-$/g,
    ""
  )

/**
 * Nieuwe leverancier, or one edited (`/app`'s `supplier-form-dialog.tsx`): the name, where orders go
 * by mail, a phone, what they make and the lead time they promise. A new one is added without a
 * portal; inviting them is its own step on their page. Undo takes it back.
 */
export function SupplierFormDialog({ open, onClose, row }: {
  readonly open: boolean
  readonly onClose: () => void
  /** The supplier to edit; absent, a new one. */
  readonly row?: SupplierRow
}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [supplies, setSupplies] = useState("")
  const [days, setDays] = useState("")
  const [tried, setTried] = useState(false)
  useEffect(() => {
    if (open) {
      setName(row?.name ?? "")
      setEmail(row?.email ?? "")
      setPhone(row?.phone ?? "")
      setSupplies(row === undefined || row.supplies === "—" ? "" : row.supplies)
      setDays(row === undefined ? "5" : String(row.promiseDays))
      setTried(false)
    }
  }, [open, row])
  const lead = Number(days.trim())
  const errors = {
    name: name.trim() === "" ? "Naam is verplicht" : undefined,
    email: email.trim() === ""
      ? "E-mailadres is verplicht"
      : !EMAIL.test(email.trim())
      ? "Dit is geen e-mailadres"
      : undefined,
    days: days.trim() === "" || !Number.isInteger(lead) || lead < 0 || lead > 30
      ? "Een heel aantal dagen, van 0 tot 30"
      : undefined
  }
  const save = () => {
    setTried(true)
    if (errors.name !== undefined || errors.email !== undefined || errors.days !== undefined) return
    const fields = {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      supplies: supplies.trim() === "" ? "—" : supplies.trim(),
      promiseDays: lead
    }
    if (row === undefined) {
      const taken = new Set(getSupplierState().created.map((x) => x.id))
      const base = slug(fields.name) || "leverancier"
      const id = taken.has(base) ? `${base}-${taken.size + 1}` : base
      const before = getSupplierState()
      setSupplierState((st) => ({
        ...st,
        created: [...st.created, {
          id,
          name: fields.name,
          email: fields.email,
          ...(fields.phone === "" ? {} : { phone: fields.phone }),
          country: "—",
          status: "actief",
          apiConnected: false,
          leadDays: 0,
          promiseDays: fields.promiseDays,
          since: "vandaag",
          supplies: fields.supplies
        }]
      }))
      navigate(paths.supplier(id))
      toast({
        title: `${fields.name} toegevoegd`,
        body: "Bestellingen gaan per e-mail tot je ze uitnodigt voor het portaal.",
        tone: "good",
        action: {
          label: "Ongedaan maken",
          onClick: () => {
            setSupplierState(() => before)
            navigate(paths.suppliers)
          }
        }
      })
    } else {
      withUndo(`${fields.name} bijgewerkt`, undefined, (st) => ({
        ...st,
        edits: { ...st.edits, [row.id]: { ...st.edits[row.id], ...fields } }
      }))
    }
    onClose()
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={row === undefined ? "Nieuwe leverancier" : `${row.name} bewerken`}
      description={row === undefined
        ? "Voeg een partij toe die je producten maakt of verstuurt. Een uitnodiging voor het portaal stuur je daarna."
        : "Wijzigingen gelden voor nieuwe bestellingen. Wat al onderweg is, blijft zoals het ging."}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button variant="primary" onClick={save}>{row === undefined ? "Toevoegen" : "Opslaan"}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-1">
        <Field label="Naam" error={tried ? errors.name : undefined}>
          {(control) => <Input {...control} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field
          label="E-mailadres voor bestellingen"
          hint="Hier komen de bestellingen binnen zolang ze niet in het portaal werken."
          error={tried ? errors.email : undefined}
        >
          {(control) => <Input {...control} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Telefoon" optional>
            {(control) => <Input {...control} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}
          </Field>
          <Field label="Levertijd" hint="Wat ze beloven, 0 tot 30" error={tried ? errors.days : undefined}>
            {(control) => (
              <Input
                {...control}
                inputMode="numeric"
                suffix="dagen"
                value={days}
                onChange={(e) => setDays(e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field label="Wat ze leveren" optional>
          {(control) => (
            <Input
              {...control}
              value={supplies}
              placeholder="Bijvoorbeeld: jassen en tassen"
              onChange={(e) => setSupplies(e.target.value)}
            />
          )}
        </Field>
      </div>
    </Dialog>
  )
}

/** A mail to one supplier's contact, or to several at once from the selection. */
export function MailDialog({ open, onClose, to, subject: initial, body: initialBody }: {
  readonly open: boolean
  readonly onClose: () => void
  readonly to: ReadonlyArray<{ readonly name: string; readonly email: string }>
  readonly subject?: string
  readonly body?: string
}) {
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  useEffect(() => {
    if (open) {
      setSubject(initial ?? "")
      setBody(initialBody ?? "")
    }
  }, [open, initial, initialBody])
  const send = () => {
    toast({
      title: to.length === 1
        ? `Mail verstuurd naar ${to[0]?.name ?? ""}`
        : `Mail verstuurd naar ${to.length} leveranciers`,
      body: "Antwoorden komen binnen in de inbox, bij de leverancier.",
      tone: "good"
    })
    onClose()
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={to.length === 1 ? `Mail aan ${to[0]?.name ?? ""}` : `Mail aan ${to.length} leveranciers`}
      description={to.map((t) => t.email).join(", ")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button variant="primary" disabled={subject.trim() === "" || body.trim() === ""} onClick={send}>
            Versturen
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-1">
        <Field label="Onderwerp">
          {(control) => <Input {...control} value={subject} onChange={(e) => setSubject(e.target.value)} />}
        </Field>
        <Field label="Bericht">
          {(control) => <Textarea {...control} rows={6} value={body} onChange={(e) => setBody(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  )
}

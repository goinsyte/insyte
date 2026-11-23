import { useEffect, useState } from "react"
import { getSupplierState, PORTAL_SCOPES, setSupplierState } from "../../fixtures/suppliers.ts"
import type { SupplierState } from "../../fixtures/suppliers.ts"
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

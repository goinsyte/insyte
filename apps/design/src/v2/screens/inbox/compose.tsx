import { useState } from "react"
import type { Ticket } from "../../fixtures/inbox.ts"
import { CUSTOMERS } from "../../fixtures/records.ts"
import { navigate, paths } from "../../router.tsx"
import { Button } from "../../ui/button.tsx"
import { Dialog } from "../../ui/dialog.tsx"
import { Field, Input, Textarea } from "../../ui/input.tsx"
import { SEND_WINDOW_S } from "../../ui/proposal.tsx"
import { toast } from "../../ui/toast.tsx"
import { MY_KEY } from "./parts.tsx"
import { createTicket, dropEntries, nowClock, patchTicket } from "./store.ts"

/*
 * Writing out of the inbox: a new mail from the support mailbox (it becomes a conversation at the top
 * of the list, waiting on the customer), and a conversation sent on to someone outside the team with
 * a line above it. Both wait out the send window, as every send in the product does.
 */

const isAddress = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())

export function ComposeDialog({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Nieuwe e-mail"
      description="Verstuurd vanuit support@northwind.co. Het gesprek komt bovenaan de inbox te staan."
      size="lg"
    >
      {open && <ComposeForm onDone={onClose} />}
    </Dialog>
  )
}

function ComposeForm({ onDone }: { readonly onDone: () => void }) {
  const [to, setTo] = useState("")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [tried, setTried] = useState(false)
  const errors = {
    to: isAddress(to) ? undefined : "Vul een geldig e-mailadres in",
    subject: subject.trim() === "" ? "Geef de mail een onderwerp" : undefined,
    body: body.trim() === "" ? "Schrijf een bericht" : undefined
  }
  const send = () => {
    setTried(true)
    if (errors.to !== undefined || errors.subject !== undefined || errors.body !== undefined) return
    const known = CUSTOMERS.find((c) => c.email.toLowerCase() === to.trim().toLowerCase())
    const number = createTicket({
      customerId: known?.id ?? "",
      handle: to.trim(),
      subject: subject.trim(),
      channel: "email",
      status: "wacht",
      priority: "gemiddeld",
      assignee: MY_KEY,
      labels: [],
      createdAt: nowClock(),
      unread: false,
      entries: [{ kind: "team", who: MY_KEY, at: nowClock(), text: body.trim() }]
    })
    onDone()
    navigate(paths.ticket(number))
    toast({
      title: `Wordt over ${SEND_WINDOW_S} s verstuurd`,
      body: `Aan ${to.trim()}, als ticket #${number}.`,
      duration: SEND_WINDOW_S * 1000,
      action: {
        label: "Niet versturen",
        onClick: () => {
          patchTicket(number, { place: "archief" })
          navigate(paths.inbox)
        }
      }
    })
  }
  return (
    <form
      className="flex flex-col gap-4 pb-2"
      onSubmit={(event) => {
        event.preventDefault()
        send()
      }}
    >
      <Field label="Aan" error={tried ? errors.to : undefined}>
        {(c) => (
          <Input
            {...c}
            autoFocus
            type="email"
            value={to}
            placeholder="naam@domein.nl"
            onChange={(e) => setTo(e.target.value)}
          />
        )}
      </Field>
      <Field label="Onderwerp" error={tried ? errors.subject : undefined}>
        {(c) => (
          <Input
            {...c}
            value={subject}
            placeholder="Over je bestelling"
            onChange={(e) => setSubject(e.target.value)}
          />
        )}
      </Field>
      <Field label="Bericht" error={tried ? errors.body : undefined}>
        {(c) => <Textarea {...c} rows={7} value={body} onChange={(e) => setBody(e.target.value)} />}
      </Field>
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onDone}>Annuleren</Button>
        <Button variant="primary" type="submit">Versturen</Button>
      </div>
    </form>
  )
}

export function ForwardDialog({ t, open, onClose }: {
  readonly t: Ticket
  readonly open: boolean
  readonly onClose: () => void
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Doorsturen"
      description={`“${t.subject}”, met alle berichten erin. De klant ziet het niet.`}
    >
      {open && <ForwardForm t={t} onDone={onClose} />}
    </Dialog>
  )
}

function ForwardForm({ t, onDone }: { readonly t: Ticket; readonly onDone: () => void }) {
  const [to, setTo] = useState("")
  const [note, setNote] = useState("")
  const [tried, setTried] = useState(false)
  const wrong = isAddress(to) ? undefined : "Vul een geldig e-mailadres in"
  const send = () => {
    setTried(true)
    if (wrong !== undefined) return
    const line = note.trim() === "" ? "" : `: “${note.trim()}”`
    patchTicket(t.number, {
      entries: [{ kind: "event", at: nowClock(), text: `Elena Hart stuurde het gesprek door naar ${to.trim()}${line}` }]
    })
    onDone()
    toast({
      title: `Wordt over ${SEND_WINDOW_S} s doorgestuurd`,
      body: `Naar ${to.trim()}.`,
      duration: SEND_WINDOW_S * 1000,
      action: { label: "Niet versturen", onClick: () => dropEntries(t.number, 1) }
    })
  }
  return (
    <form
      className="flex flex-col gap-4 pb-2"
      onSubmit={(event) => {
        event.preventDefault()
        send()
      }}
    >
      <Field label="Aan" error={tried ? wrong : undefined}>
        {(c) => (
          <Input
            {...c}
            autoFocus
            type="email"
            value={to}
            placeholder="naam@bedrijf.nl"
            onChange={(e) => setTo(e.target.value)}
          />
        )}
      </Field>
      <Field label="Notitie" optional hint="Een regel boven de doorgestuurde mail.">
        {(c) => <Textarea {...c} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onDone}>Annuleren</Button>
        <Button variant="primary" type="submit">Doorsturen</Button>
      </div>
    </form>
  )
}

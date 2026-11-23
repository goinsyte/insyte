import { useState } from "react"
import { LABELS, PRIORITY, STATUS_ORDER, TEMPLATES, TICKET_STATUS } from "../../fixtures/inbox.ts"
import type { PersonKey, Priority, TicketStatus } from "../../fixtures/inbox.ts"
import { CUSTOMERS } from "../../fixtures/records.ts"
import { PEOPLE } from "../../fixtures/workspace.ts"
import { navigate, paths } from "../../router.tsx"
import { Button } from "../../ui/button.tsx"
import { Checkbox } from "../../ui/checkbox.tsx"
import { Dialog } from "../../ui/dialog.tsx"
import { Field, Input, Select, Textarea } from "../../ui/input.tsx"
import { toast } from "../../ui/toast.tsx"
import { MY_KEY } from "./parts.tsx"
import { createTicket, nowClock } from "./store.ts"

type Form = {
  readonly title: string
  readonly description: string
  readonly customerId: string
  readonly status: TicketStatus
  readonly priority: Priority
  readonly assignee: PersonKey | ""
  readonly labels: ReadonlyArray<string>
}

const blank = (status: TicketStatus): Form => ({
  title: "",
  description: "",
  customerId: "",
  status,
  priority: "gemiddeld",
  assignee: MY_KEY,
  labels: []
})

function fromTemplate(id: string | undefined, status: TicketStatus): Form {
  const t = TEMPLATES.find((x) => x.id === id)
  if (t === undefined) return blank(status)
  return { ...blank(status), title: t.title, description: t.description, priority: t.priority, labels: t.labels }
}

/**
 * A ticket written by hand: for work no customer started (a supplier to chase, a text to translate)
 * or a call that has to be on the board. A template fills the form in; the operator edits from there.
 */
export function NewTicketDialog({ open, onClose, template, status }: {
  readonly open: boolean
  readonly onClose: () => void
  readonly template?: string
  readonly status: TicketStatus
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Nieuw ticket"
      description="Leg klantenservice, leveringen of teamwerk vast."
      size="lg"
    >
      {open && (
        <NewTicketForm key={`${template ?? "leeg"}-${status}`} template={template} status={status} onDone={onClose} />
      )}
    </Dialog>
  )
}

function NewTicketForm({ template, status, onDone }: {
  readonly template?: string
  readonly status: TicketStatus
  readonly onDone: () => void
}) {
  const [form, setForm] = useState<Form>(() => fromTemplate(template, status))
  const [tried, setTried] = useState(false)
  const titleMissing = form.title.trim() === "" || form.title.endsWith("· ")

  const submit = () => {
    setTried(true)
    if (titleMissing) return
    const customer = CUSTOMERS.find((c) => c.id === form.customerId)
    const number = createTicket({
      customerId: form.customerId,
      handle: customer?.email ?? "Intern",
      subject: form.title.trim(),
      channel: "email",
      status: form.status,
      priority: form.priority,
      assignee: form.assignee === "" ? null : form.assignee,
      labels: form.labels,
      createdAt: nowClock(),
      unread: false,
      entries: form.description.trim() === ""
        ? [{ kind: "event", at: nowClock(), text: "Elena Hart maakte het ticket." }]
        : [{ kind: "note", who: MY_KEY, at: nowClock(), text: form.description.trim() }]
    })
    onDone()
    toast({
      title: `Ticket #${number} aangemaakt in ${TICKET_STATUS[form.status].label}`,
      tone: "good",
      action: { label: "Openen", onClick: () => navigate(paths.ticket(number)) }
    })
  }

  return (
    <form
      className="flex flex-col gap-4 pb-2"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <Field label="Titel" error={tried && titleMissing ? "Geef het ticket een titel" : undefined}>
        {(control) => (
          <Input
            {...control}
            autoFocus
            value={form.title}
            placeholder="Wat moet er gebeuren?"
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
        )}
      </Field>
      <Field label="Beschrijving" optional>
        {(control) => (
          <Textarea
            {...control}
            rows={4}
            value={form.description}
            placeholder="Details, links of de stappen tot nu toe"
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        )}
      </Field>
      <Field label="Klant" optional hint="Laat leeg voor intern werk.">
        {(control) => (
          <Select
            {...control}
            value={form.customerId}
            onChange={(event) => setForm({ ...form, customerId: event.target.value })}
          >
            <option value="">Geen klant</option>
            {CUSTOMERS.filter((c) => c.duplicateOf === undefined).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Status">
          {(control) => (
            <Select
              {...control}
              value={form.status}
              onChange={(event) => setForm({ ...form, status: event.target.value as TicketStatus })}
            >
              {STATUS_ORDER.filter((s) => s !== "klaar").map((s) => (
                <option key={s} value={s}>{TICKET_STATUS[s].label}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Prioriteit">
          {(control) => (
            <Select
              {...control}
              value={form.priority}
              onChange={(event) => setForm({ ...form, priority: event.target.value as Priority })}
            >
              {(["hoog", "gemiddeld", "laag"] as const).map((p) => (
                <option key={p} value={p}>{PRIORITY[p].label}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Toegewezen aan">
          {(control) => (
            <Select
              {...control}
              value={form.assignee}
              onChange={(event) => setForm({ ...form, assignee: event.target.value as PersonKey | "" })}
            >
              <option value="">Niemand</option>
              {(Object.keys(PEOPLE) as ReadonlyArray<PersonKey>).map((k) => (
                <option key={k} value={k}>{PEOPLE[k].name}</option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="pb-1.5 text-xs font-medium text-ink">Labels</legend>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
          {LABELS.map((label) => (
            <Checkbox
              key={label}
              label={label}
              checked={form.labels.includes(label)}
              onChange={(on) =>
                setForm({ ...form, labels: on ? [...form.labels, label] : form.labels.filter((l) => l !== label) })}
            />
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onDone}>Annuleren</Button>
        <Button variant="primary" type="submit">Ticket aanmaken</Button>
      </div>
    </form>
  )
}

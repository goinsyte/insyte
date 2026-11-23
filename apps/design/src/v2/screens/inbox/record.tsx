import { busyName, LABELS, TICKET_STATUS } from "../../fixtures/inbox.ts"
import type { Ticket } from "../../fixtures/inbox.ts"
import { customer, euro, order, ORDER_STATUS, product, when } from "../../fixtures/records.ts"
import { PEOPLE } from "../../fixtures/workspace.ts"
import { Link, paths } from "../../router.tsx"
import { Avatar } from "../../ui/avatar.tsx"
import { RecordLabel, Status } from "../../ui/badge.tsx"
import { Button } from "../../ui/button.tsx"
import { DropdownItem, DropdownLabel, DropdownMenu } from "../../ui/dropdown.tsx"
import { ArrowUpRight, Plus } from "../../ui/icons.tsx"
import { KeyValue } from "../../ui/key-value.tsx"
import { toast } from "../../ui/toast.tsx"
import { AssignMenu, Heading, PriorityMenu, StatusMenu } from "./parts.tsx"
import { patchTicket } from "./store.ts"

/** The customer's name on a ticket: the shared record's, or the busy week's invented one. */
export function customerName(t: Ticket): string {
  const c = customer(t.customerId)
  if (c !== undefined) return c.name
  if (!t.customerId.startsWith("druk-")) return t.handle
  return busyName(Number(t.customerId.slice("druk-".length)))
}

const COUNTRY: Readonly<Record<string, string>> = {
  NL: "Nederland",
  BE: "België",
  DE: "Duitsland",
  FR: "Frankrijk",
  NO: "Noorwegen",
  SE: "Zweden",
  IT: "Italië",
  ES: "Spanje",
  GB: "Verenigd Koninkrijk",
  IE: "Ierland",
  PL: "Polen",
  PT: "Portugal"
}

const linkClass = "inline-flex items-center gap-1 font-medium text-ink underline-offset-2 hover:underline"

/**
 * The record side of a ticket: the customer, the order it is about, what else it touches, and the
 * ticket's own fields (status, priority, who has it, labels). Every record links to its own page.
 */
export function TicketRecord({ t, others, edit }: {
  readonly t: Ticket
  /** The customer's other tickets. */
  readonly others: ReadonlyArray<Ticket>
  readonly edit: boolean
}) {
  const c = customer(t.customerId)
  const o = t.order === undefined ? undefined : order(t.order)
  const addLabel = (label: string) => {
    const before = t.labels
    patchTicket(t.number, { labels: [...t.labels, label] })
    toast({
      title: `Label ${label} toegevoegd`,
      action: { label: "Ongedaan maken", onClick: () => patchTicket(t.number, { labels: before }) }
    })
  }
  const removeLabel = (label: string) => {
    const before = t.labels
    patchTicket(t.number, { labels: t.labels.filter((l) => l !== label) })
    toast({
      title: `Label ${label} weggehaald`,
      action: { label: "Ongedaan maken", onClick: () => patchTicket(t.number, { labels: before }) }
    })
  }

  return (
    <div className="flex flex-col gap-7">
      <section aria-labelledby={`klant-${t.number}`} className="flex flex-col gap-2">
        <Heading id={`klant-${t.number}`}>Klant</Heading>
        <div className="flex items-center gap-2.5">
          <Avatar name={customerName(t)} size={32} />
          <div className="flex min-w-0 flex-col">
            {c === undefined
              ? <span className="truncate text-sm font-medium text-ink">{customerName(t)}</span>
              : (
                <Link to={paths.customer(c.id)} className={`${linkClass} truncate text-sm`}>
                  {c.name}
                </Link>
              )}
            <span className="truncate text-xs text-ink-3">{t.handle}</span>
          </div>
        </div>
        {c !== undefined && (
          <KeyValue
            items={[
              { label: "Woont in", value: `${c.city}, ${COUNTRY[c.country] ?? c.country}` },
              { label: "Klant sinds", value: c.since },
              { label: "Bestellingen", value: c.ordersCount, figure: true },
              { label: "Totaal besteed", value: euro(c.lifetimeValue), figure: true }
            ]}
          />
        )}
        {c !== undefined && c.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {c.tags.map((tag) => <RecordLabel key={tag}>{tag}</RecordLabel>)}
          </div>
        )}
      </section>

      {o !== undefined && (
        <section aria-labelledby={`order-${t.number}`} className="flex flex-col gap-2">
          <Heading id={`order-${t.number}`}>Bestelling</Heading>
          <div className="flex items-baseline justify-between gap-2">
            <Link to={paths.order(o.number)} className={`${linkClass} figure text-sm`}>
              #{o.number}
              <ArrowUpRight size={13} className="text-ink-3" />
            </Link>
            <Status tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Status>
          </div>
          <ul className="flex flex-col gap-1 text-sm text-ink-2">
            {o.lines.map((line) => (
              <li key={`${line.productId}-${line.size}`} className="flex justify-between gap-2">
                <Link to={paths.product(line.productId)} className="min-w-0 truncate hover:text-ink hover:underline">
                  {product(line.productId)?.name ?? line.productId}
                  <span className="text-ink-3">· {line.size}</span>
                </Link>
                <span className="figure shrink-0">{line.quantity} ×</span>
              </li>
            ))}
          </ul>
          <KeyValue
            items={[
              { label: "Totaal", value: euro(o.total), figure: true },
              { label: "Geplaatst", value: when(o.placedAt), figure: true },
              { label: "Vervoerder", value: o.carrier },
              { label: "Betaald met", value: o.payment },
              ...(o.promisedAt === undefined ? [] : [{
                label: "Beloofd op",
                value: o.promisedAt.toLocaleDateString("nl-NL", { day: "numeric", month: "long" }),
                figure: true
              }])
            ]}
          />
        </section>
      )}

      {t.also !== undefined && (
        <section aria-labelledby={`ook-${t.number}`} className="flex flex-col gap-2">
          <Heading id={`ook-${t.number}`}>Gaat ook over</Heading>
          <Link
            to={t.also.kind === "chargeback"
              ? paths.chargeback(t.also.id)
              : t.also.kind === "product"
              ? paths.product(t.also.id)
              : paths.supplier(t.also.id)}
            className={`${linkClass} text-sm`}
          >
            {t.also.label}
            <ArrowUpRight size={13} className="text-ink-3" />
          </Link>
          {t.also.kind === "chargeback" && (
            <p className="text-xs text-ink-3">Klarna · € 129,00 · antwoord uiterlijk morgen 12:00</p>
          )}
        </section>
      )}

      <section aria-labelledby={`ticket-${t.number}`} className="flex flex-col gap-1">
        <Heading id={`ticket-${t.number}`}>Ticket</Heading>
        <div className="-mx-2 flex flex-col items-start">
          <StatusMenu t={t} disabled={!edit} />
          <PriorityMenu t={t} disabled={!edit} />
          <AssignMenu t={t} disabled={!edit} />
        </div>
        {t.assignee !== null && (
          <Link to={paths.person(PEOPLE[t.assignee].id)} className="text-xs text-ink-3 hover:text-ink hover:underline">
            {PEOPLE[t.assignee].name} · {PEOPLE[t.assignee].role}
          </Link>
        )}
      </section>

      <section aria-labelledby={`labels-${t.number}`} className="flex flex-col gap-2">
        <Heading id={`labels-${t.number}`}>Labels</Heading>
        <div className="flex flex-wrap items-center gap-1.5">
          {t.labels.map((label) => (
            <RecordLabel key={label} onRemove={edit ? () => removeLabel(label) : undefined}>{label}</RecordLabel>
          ))}
          {t.labels.length === 0 && <span className="text-xs text-ink-3">Nog geen labels</span>}
          {edit && (
            <DropdownMenu
              label="Label toevoegen"
              width="w-52"
              trigger={(props) => (
                <Button size="sm" variant="ghost" icon={<Plus />} className="pointer-coarse:h-11" {...props}>
                  Label
                </Button>
              )}
            >
              <DropdownLabel>Label toevoegen</DropdownLabel>
              {LABELS.filter((l) => !t.labels.includes(l)).map((label) => (
                <DropdownItem
                  key={label}
                  onSelect={() => addLabel(label)}
                >
                  {label}
                </DropdownItem>
              ))}
            </DropdownMenu>
          )}
        </div>
      </section>

      {others.length > 0 && (
        <section aria-labelledby={`meer-${t.number}`} className="flex flex-col gap-1.5">
          <Heading id={`meer-${t.number}`}>Andere tickets van {customerName(t).split(" ")[0]}</Heading>
          <ul className="flex flex-col gap-1">
            {others.map((x) => (
              <li key={x.number} className="flex items-baseline justify-between gap-2 text-sm">
                <Link
                  to={paths.ticket(x.number)}
                  className="min-w-0 truncate text-ink-2 hover:text-ink hover:underline"
                >
                  <span className="figure">#{x.number}</span> {x.subject}
                </Link>
                <span className="shrink-0 text-xs text-ink-3">{TICKET_STATUS[x.status].label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

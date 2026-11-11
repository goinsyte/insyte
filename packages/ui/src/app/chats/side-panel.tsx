import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import type { ChatCommandId, ChatRecordRef, RichMessage } from "../../data-source"
import { ArrowLeft, ArrowUpRight, ExternalLink, FileText, Hash, Sparkles, X } from "../../icons"
import { formatCurrency, formatRelative } from "../lib/format"
import { cn } from "../lib/utils"
import { useWorkspace } from "../stores/workspace-store"
import { useChat } from "./chat-context"
import { blocked, COMMAND } from "./commands"
import { continues, MessageRow } from "./message-row"
import { Avatar } from "./profile-card"
import { KindTile, StatusDot } from "./record-views"
import {
  CHARGEBACK_STATUS,
  type ChatRecord,
  KIND_LABEL,
  ORDER_STATUS,
  TICKET_STATUS,
  usePools,
  useRecord
} from "./records"

/*
 * The column beside the conversation. It holds one of two things: a thread, so a side conversation
 * does not bury the channel, or a record, opened from a card or a number in a message. A record here
 * is workable: its actions run as the person at the keyboard and post their card in the channel, so
 * the team sees what was done without anyone writing "done". Records lead to records (an order's
 * customer, a customer's orders), and Terug walks back.
 */

export function PanelFrame(
  { title, sub, onBack, onClose, actions, children }: {
    title: React.ReactNode
    sub?: React.ReactNode
    onBack?: () => void
    onClose: () => void
    actions?: React.ReactNode
    children: React.ReactNode
  }
) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 px-3">
        {onBack ?
          (
            <button
              type="button"
              onClick={onBack}
              aria-label="Terug"
              className="flex size-8 items-center justify-center rounded-md text-ink-2 hover:bg-ink/6 hover:text-ink"
            >
              <ArrowLeft className="size-4" strokeWidth={1.75} />
            </button>
          ) :
          null}
        <div className="flex min-w-0 flex-1 items-baseline gap-2 pl-1">
          <h2 className="truncate font-medium text-ink text-md">{title}</h2>
          {sub ? <span className="truncate text-ink-3 text-sm">{sub}</span> : null}
        </div>
        {actions}
        <button
          type="button"
          onClick={onClose}
          aria-label="Sluiten"
          className="flex size-8 items-center justify-center rounded-md text-ink-2 hover:bg-ink/6 hover:text-ink"
        >
          <X className="size-4" strokeWidth={1.75} />
        </button>
      </header>
      {children}
    </div>
  )
}

export function ThreadPanel(
  { parent, onClose, composer }: { parent: RichMessage; onClose: () => void; composer: React.ReactNode }
) {
  const chat = useChat()
  const replies = chat.repliesFor(parent.id)
  return (
    <PanelFrame title="Thread" sub={`#${chat.conversation.name}`} onClose={onClose}>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-2">
        <div className="px-1 pt-1">
          <MessageRow message={parent} continuation={false} inThread />
        </div>
        <div className="flex items-center gap-3 px-4 py-2">
          <span className="font-medium text-arc-ink text-sm">
            {replies.length} {replies.length === 1 ? "antwoord" : "antwoorden"}
          </span>
          <span className="h-px flex-1 bg-ink/8" />
        </div>
        <div className="flex flex-col gap-0.5 px-1">
          {replies.map((m, i) => (
            <MessageRow key={m.id} message={m} continuation={continues(replies[i - 1], m)} inThread />
          ))}
        </div>
      </div>
      {composer}
    </PanelFrame>
  )
}

export function RecordPanel(
  { refTo, canBack, onBack, onClose }: {
    refTo: ChatRecordRef
    canBack: boolean
    onBack: () => void
    onClose: () => void
  }
) {
  const r = useRecord(refTo)
  const navigate = useNavigate()
  const chat = useChat()
  if (!r) {
    return (
      <PanelFrame title={KIND_LABEL[refTo.kind]} onClose={onClose}>
        <p className="px-4 text-ink-3 text-sm">Dit record bestaat niet meer.</p>
      </PanelFrame>
    )
  }
  return (
    <PanelFrame
      title={r.code}
      sub={KIND_LABEL[r.kind]}
      {...(canBack ? { onBack } : {})}
      onClose={onClose}
      actions={
        <button
          type="button"
          onClick={() =>
            navigate({
              to: r.to as never,
              ...(r.params ? { params: r.params as never } : {}),
              ...(r.kind === "ticket" ? { search: { ticket: r.ref.id } as never } : {})
            })}
          aria-label="Volledig openen"
          title="Volledig openen"
          className="flex size-8 items-center justify-center rounded-md text-ink-2 hover:bg-ink/6 hover:text-ink"
        >
          <ExternalLink className="size-4" strokeWidth={1.75} />
        </button>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pt-1 pb-6">
        <section className="flex items-start gap-3">
          <KindTile kind={r.kind} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="font-medium text-ink text-lg leading-tight">{r.title}</span>
            <span className="text-ink-3 text-sm">{r.detail}</span>
            <div className="mt-1 flex items-center gap-3">
              {r.amount
                ? <span className="font-medium text-ink text-xl tabular-nums tracking-tight">{r.amount}</span>
                : null}
              {r.status ? <StatusDot status={r.status} /> : null}
            </div>
          </div>
        </section>
        <Actions r={r} />
        <Body r={r} />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => chat.attach(r.ref)}
            className="flex h-8 items-center gap-1.5 rounded-md bg-arc-tint px-3 font-medium text-arc-ink text-sm transition-colors hover:bg-arc/15"
          >
            <Hash className="size-3.5" strokeWidth={2} />
            Delen in #{chat.conversation.name}
          </button>
          <button
            type="button"
            onClick={() => {
              chat.attach(r.ref)
              chat.mention("Insyte")
            }}
            className="flex h-8 items-center gap-1.5 rounded-md px-3 font-medium text-arc-ink text-sm transition-colors hover:bg-arc-tint"
          >
            <Sparkles className="size-3.5" strokeWidth={1.75} />
            Vraag Insyte
          </button>
        </div>
      </div>
    </PanelFrame>
  )
}

/** The verbs this record has, each one a command the channel will see. */
function Actions({ r }: { r: ChatRecord }) {
  const chat = useChat()
  const [note, setNote] = useState<string | null>(null)
  const verbs: Array<{ id: ChatCommandId; arg?: string; label?: string }> = r.kind === "order"
    ? [{ id: "refund" }, { id: "cancel" }, { id: "ticket" }]
    : r.kind === "chargeback"
    ? [{ id: "evidence" }, { id: "accept" }, { id: "ticket" }]
    : r.kind === "ticket"
    ? [
      { id: "status", arg: "bezig", label: "Bezig" },
      { id: "status", arg: "wacht", label: "Wacht" },
      { id: "status", arg: "klaar", label: "Klaar" },
      { id: "assign", arg: "Elena", label: "Aan mij" }
    ]
    : [{ id: "ticket" }]
  const canNote = r.kind === "order" || r.kind === "chargeback"
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {verbs.map((v, i) => {
          const why = blocked(v.id, r, v.arg ?? (v.id === "ticket" ? `${r.code} · ${r.title}` : undefined))
          const c = COMMAND[v.id]
          return (
            <button
              key={`${v.id}-${v.arg ?? ""}`}
              type="button"
              disabled={Boolean(why)}
              title={why ?? c.hint}
              onClick={() => chat.act(v.id, r.ref, v.arg)}
              className={cn(
                "flex h-8 items-center rounded-md px-3 font-medium text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                /* One primary per record: its first verb. The rest wait their turn in ink. */
                i === 0 && r.kind !== "ticket"
                  ? "bg-abyss text-mesh-ink shadow-primary hover:bg-abyss-2"
                  : "bg-ink/6 text-ink hover:bg-ink/10"
              )}
            >
              {v.label ?? c.label}
            </button>
          )
        })}
        {canNote ?
          (
            <button
              type="button"
              onClick={() => setNote(note === null ? "" : null)}
              className="flex h-8 items-center gap-1.5 rounded-md bg-ink/6 px-3 font-medium text-ink text-sm hover:bg-ink/10"
            >
              <FileText className="size-3.5" strokeWidth={1.75} />
              Notitie
            </button>
          ) :
          null}
      </div>
      {note !== null ?
        (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!note.trim()) return
              chat.act("note", r.ref, note.trim())
              setNote(null)
            }}
            className="flex gap-2"
          >
            <input
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Interne notitie"
              aria-label="Interne notitie"
              className="field h-8 min-w-0 flex-1 rounded-md px-2.5 text-ink text-sm outline-none focus:bg-paper"
            />
            <button
              type="submit"
              className="h-8 rounded-md bg-abyss px-3 font-medium text-mesh-ink text-sm shadow-primary hover:bg-abyss-2"
            >
              Zetten
            </button>
          </form>
        ) :
        null}
      <p className="text-ink-3 text-xs">Wat je hier doet, verschijnt in #{chat.conversation.name}.</p>
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <dt className="shrink-0 text-ink-3">{label}</dt>
      <dd className="min-w-0 text-right text-ink">{children}</dd>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="font-medium text-ink-2 text-sm">{title}</h3>
      {children}
    </section>
  )
}

function LinkRow({ refTo, children }: { refTo: ChatRecordRef; children: React.ReactNode }) {
  const chat = useChat()
  return (
    <button
      type="button"
      onClick={() => chat.openRecord(refTo)}
      className="group/link -mx-2 flex items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-arc-tint/60"
    >
      {children}
      <ArrowUpRight className="size-3.5 shrink-0 text-ink-4 group-hover/link:text-arc-ink" strokeWidth={1.75} />
    </button>
  )
}

function Body({ r }: { r: ChatRecord }) {
  const pools = usePools()
  const members = useWorkspace((s) => s.members)
  if (r.kind === "order") {
    const o = r.order
    const cb = pools.chargebacks.filter((c) => c.order_id === o.id)
    return (
      <>
        <Section title="Artikelen">
          <ul className="flex flex-col">
            {o.line_items.map((l) => (
              <li key={l.id} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                <span className="min-w-0 truncate text-ink">
                  {l.title} <span className="text-ink-3">· {l.variant_title} × {l.quantity}</span>
                </span>
                <span className="shrink-0 text-ink tabular-nums">
                  {formatCurrency(l.unit_price * l.quantity, o.currency, { maximumFractionDigits: 2 })}
                </span>
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Klant">
          <LinkRow refTo={{ kind: "customer", id: o.customer_id }}>
            <Avatar senderId={o.customer_id} name={o.customer_name} size={28} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-ink text-sm">{o.customer_name}</span>
              <span className="truncate text-ink-3 text-xs">{o.customer_email}</span>
            </span>
          </LinkRow>
        </Section>
        <dl className="flex flex-col">
          <Row label="Status">{ORDER_STATUS[o.status].label}</Row>
          <Row label="Betaling">
            {o.payment_status === "paid"
              ? "Betaald"
              : o.payment_status === "refunded"
              ? "Terugbetaald"
              : o.payment_status === "voided"
              ? "Vervallen"
              : "Open"}
          </Row>
          {o.carrier ? <Row label="Vervoerder">{o.carrier}</Row> : null}
          {o.tracking_number ? <Row label="Track & trace">{o.tracking_number}</Row> : null}
          {o.shipping_address ? <Row label="Adres">{`${o.shipping_address.city}`}</Row> : null}
          <Row label="Geplaatst">{formatRelative(o.created_at)}</Row>
        </dl>
        {o.notes ?
          (
            <Section title="Notitie">
              <p className="rounded-lg bg-mist px-3 py-2 text-ink/90 text-sm">{o.notes}</p>
            </Section>
          ) :
          null}
        {cb.length ?
          (
            <Section title="Chargebacks">
              {cb.map((c) => (
                <LinkRow key={c.id} refTo={{ kind: "chargeback", id: c.id }}>
                  <span className="font-medium text-arc-ink text-sm">{c.case_number}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-2 text-sm">{c.reason}</span>
                  <StatusDot status={CHARGEBACK_STATUS[c.status]} />
                </LinkRow>
              ))}
            </Section>
          ) :
          null}
      </>
    )
  }
  if (r.kind === "customer") {
    const c = r.customer
    const orders = pools.orders.filter((o) => o.customer_id === c.id).slice(0, 6)
    return (
      <>
        <dl className="flex flex-col">
          <Row label="E-mail">{c.email}</Row>
          <Row label="Bestellingen">{c.orders_count}</Row>
          <Row label="Totaal besteed">{formatCurrency(c.lifetime_value, "USD")}</Row>
          <Row label="Klant sinds">{formatRelative(c.created_at)}</Row>
        </dl>
        {c.tags.length ?
          (
            <div className="flex flex-wrap gap-1.5">
              {c.tags.map((t) => (
                <span key={t} className="rounded-md bg-ink/6 px-2 py-0.5 text-ink-2 text-xs">
                  {t}
                </span>
              ))}
            </div>
          ) :
          null}
        <Section title="Recente bestellingen">
          {orders.length ?
            (
              orders.map((o) => (
                <LinkRow key={o.id} refTo={{ kind: "order", id: o.id }}>
                  <span className="font-medium text-arc-ink text-sm">{o.number}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-3 text-sm">{formatRelative(o.created_at)}</span>
                  <StatusDot status={ORDER_STATUS[o.status]} />
                  <span className="text-ink text-sm tabular-nums">{formatCurrency(o.total, o.currency)}</span>
                </LinkRow>
              ))
            ) :
            <p className="text-ink-3 text-sm">Nog geen bestellingen in deze winkel.</p>}
        </Section>
      </>
    )
  }
  if (r.kind === "product") {
    const p = r.product
    return (
      <>
        {p.images[0]
          ? <img src={p.images[0]} alt="" className="aspect-[4/3] w-full rounded-xl bg-mist object-cover" />
          : null}
        <dl className="flex flex-col">
          <Row label="Prijs">{formatCurrency(p.price, p.currency, { maximumFractionDigits: 2 })}</Row>
          {p.margin !== undefined ? <Row label="Marge">{Math.round(p.margin * (p.margin < 1 ? 100 : 1))}%</Row> : null}
        </dl>
        <Section title="Varianten">
          <ul className="flex flex-col">
            {p.variants.map((v) => (
              <li key={v.id} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                <span className="min-w-0 truncate text-ink">{v.title}</span>
                <span
                  className={cn(
                    "shrink-0 tabular-nums",
                    v.inventory_level < 5 ? "font-medium text-signal-red" : "text-ink-2"
                  )}
                >
                  {v.inventory_level} op voorraad
                </span>
              </li>
            ))}
          </ul>
        </Section>
      </>
    )
  }
  if (r.kind === "chargeback") {
    const c = r.chargeback
    return (
      <>
        <dl className="flex flex-col">
          <Row label="Reden">{c.reason}</Row>
          <Row label="Deadline">{formatRelative(c.deadline_at)}</Row>
          <Row label="Geopend">{formatRelative(c.opened_at)}</Row>
        </dl>
        {c.order_id ?
          (
            <Section title="Bestelling">
              <LinkRow refTo={{ kind: "order", id: c.order_id }}>
                <span className="font-medium text-arc-ink text-sm">
                  {pools.orders.find((o) => o.id === c.order_id)?.number ?? c.order_id}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink-2 text-sm">{c.customer_name}</span>
              </LinkRow>
            </Section>
          ) :
          null}
        <Section title={`Bewijs · ${c.evidence_files.length}`}>
          {c.evidence_files.length ?
            (
              <ul className="flex flex-col">
                {c.evidence_files.map((f) => (
                  <li key={f.name} className="flex items-center gap-2 py-1.5 text-sm">
                    <FileText className="size-3.5 text-ink-3" strokeWidth={1.75} />
                    <span className="min-w-0 flex-1 truncate text-ink">{f.name}</span>
                  </li>
                ))}
              </ul>
            ) :
            <p className="text-ink-3 text-sm">Nog geen bewijs. Bewijs indienen stelt het pakket samen.</p>}
        </Section>
        {c.timeline.length ?
          (
            <Section title="Tijdlijn">
              <ol className="flex flex-col gap-2.5 pt-1">
                {c.timeline.slice(0, 5).map((t, i) => (
                  <li key={`${t.at}-${i}`} className="flex gap-2.5 text-sm">
                    <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", i === 0 ? "bg-arc" : "bg-ink-4")} />
                    <span className="flex flex-col">
                      <span className="text-ink">{t.event}</span>
                      <span className="text-ink-3 text-xs">
                        {t.actor} · {formatRelative(t.at)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </Section>
          ) :
          null}
      </>
    )
  }
  const t = r.ticket
  const assignees = members.filter((m) => t.assignee_ids.includes(m.id))
  return (
    <>
      <dl className="flex flex-col">
        <Row label="Status">{TICKET_STATUS[t.status].label}</Row>
        <Row label="Prioriteit">{t.priority === "high" ? "Hoog" : t.priority === "medium" ? "Normaal" : "Laag"}</Row>
        <Row label="Toegewezen">
          {assignees.length ? assignees.map((m) => m.name.split(" ")[0]).join(", ") : "Niemand"}
        </Row>
      </dl>
      {t.description ? <p className="text-ink/90 text-sm leading-relaxed">{t.description}</p> : null}
      {t.related_entity && t.related_entity.type !== "customer" ?
        (
          <Section title="Gaat over">
            <LinkRow refTo={{ kind: t.related_entity.type, id: t.related_entity.id }}>
              <span className="font-medium text-arc-ink text-sm">{t.related_entity.label}</span>
            </LinkRow>
          </Section>
        ) :
        null}
    </>
  )
}

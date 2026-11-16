import { Link } from "@tanstack/react-router"
import { ArrowRight } from "../../icons"
import { AgentSuggestion, useMyName } from "../ask/agent-demo"
import { ME } from "../lib/assignees"
import { formatCurrency } from "../lib/format"
import { undoable } from "../lib/undo"
import { type ThreadState, useInbox } from "../stores/inbox-store"
import { useWorkspace } from "../stores/workspace-store"
import { AgentBand, AgentHandled } from "./chat-views"

export { AgentBand, AgentHandled }

/**
 * What the customer agent did on a chat (PLAN 28, ADR-0027 "handover is a first-class result"). A
 * handover is a band at the head of the letter: why, the summary it left, and Overnemen or Teruggeven
 * aan Insyte. A conversation it handled is one quiet line. When the shopper asked for money, the
 * agent's refund is a plate — Eerst vragen, locked — that asks again before it is filed.
 */
export function AgentBanner({ thread }: { thread: ThreadState }) {
  const me = useMyName()
  const update = useInbox((s) => s.update)
  const order = useWorkspace((s) => (thread.orderRef ? s.orders.find((o) => o.number === thread.orderRef) : undefined))
  const a = thread.agent
  if (!a) return null

  if (a.state === "handled") return <AgentHandled summary={a.summary} />

  const taken = a.state === "handed_over" && thread.assignee !== undefined
  const takeOver = () => {
    const before = { assignee: thread.assignee, agent: a }
    update(thread.id, { assignee: ME, agent: { ...a, state: "handed_over" } })
    undoable(
      "Jij hebt het gesprek overgenomen",
      () => update(thread.id, before),
      "Insyte antwoordt niet meer tot je het teruggeeft."
    )
  }
  const giveBack = () => {
    const before = { assignee: thread.assignee, agent: a }
    update(thread.id, { assignee: undefined, agent: { ...a, state: "active", at: new Date().toISOString() } })
    undoable("Teruggegeven aan Insyte", () => update(thread.id, before), "Insyte antwoordt weer op nieuwe berichten.")
  }
  const refund = order && /terugbetal|geld terug/i.test(`${a.reason ?? ""} ${a.summary ?? ""}`)
  const line = order?.line_items.find((l) => l.product_id === "prod_2013") ?? order?.line_items[0]
  const amount = line ? line.unit_price : 0

  return (
    <div className="mb-3 flex flex-col gap-3">
      <AgentBand
        state={a.state}
        reason={a.reason}
        summary={a.summary}
        taken={taken}
        me={me}
        onTakeOver={takeOver}
        onGiveBack={giveBack}
      />
      {refund && order && line && a.state !== "active" ?
        (
          <AgentSuggestion
            id={`refund:${thread.id}`}
            action="RefundOrder"
            level={2}
            proposal={{
              title: `${formatCurrency(amount, order.currency)} terugbetalen voor ${order.number}`,
              body:
                `${line.title} voor ${order.customer_name}. Buiten je regels: bezorgd 27 dagen geleden en een sale-artikel. Een goodwill-terugbetaling is aan jou.`,
              confidence: 62,
              why: "De klant vroeg in de chat om geld terug. Insyte belooft nooit geld; het legt het aan jou voor.",
              fileLabel: "Terugbetalen",
              action: { kind: "open", to: `/orders/${order.id}` }
            }}
            confirmFirst={{
              title: `${formatCurrency(amount, order.currency)} terugbetalen aan ${order.customer_name}?`,
              description:
                `Het geld gaat terug op de betaalmethode van ${order.number}. Dit kan niet worden teruggedraaid.`,
              confirmLabel: "Terugbetalen"
            }}
            draft={{
              sentence: `${formatCurrency(amount, order.currency)} terugbetaald voor ${order.number}`,
              record: { kind: "order", label: order.number, to: `/orders/${order.id}`, id: order.id },
              trigger: "Websitechat op Northwind EU",
              sources: [{
                kind: "thread",
                title: `Websitechat · ${order.customer_name}`,
                detail: "“Ik wil mijn geld terug”"
              }, { kind: "order", title: order.number, detail: line.title, to: `/orders/${order.id}` }],
              reason: "Goodwill buiten de retourregels, na goedkeuring."
            }}
            perform={() => {
              useWorkspace.getState().addOrderNote(
                order.id,
                `${formatCurrency(amount, order.currency)} terugbetaald (goodwill) na een overdracht in de websitechat`
              )
              return { after: "Terugbetaald" }
            }}
          />
        ) :
        null}
      <span className="flex items-center gap-1 text-ink-3 text-xs">
        <ArrowRight className="size-3" strokeWidth={2} />
        <Link to="/ask/activity" className="text-arc-ink hover:underline">
          Wat Insyte las en waarom
        </Link>
      </span>
    </div>
  )
}

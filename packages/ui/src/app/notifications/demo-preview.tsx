import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Send } from "../../icons"
import { useWorkflows } from "../automations/workflow-store"
import { fullTime, type Note } from "../lib/notifications"
import { undoable } from "../lib/undo"
import { useChatStore } from "../stores/chat-store"
import { useWorkspace } from "../stores/workspace-store"
import { type NotePrimary, type NoteRecord, useNotificationsSource } from "./source"

/*
 * The preview's record in the design app: what a note is about, read live from the demo workspace, and the one thing
 * to do about it there. A proposal is filed here, a mention is answered here, an invitation is sent again here;
 * everything else opens its record. Doing it reads the notification. The console reads none of these stores.
 */

const ORDER_STATUS: Record<string, string> = {
  placed: "Geplaatst",
  paid: "Betaald",
  at_supplier: "Bij leverancier",
  shipped: "Verzonden",
  delivered: "Bezorgd",
  cancelled: "Geannuleerd",
  refunded: "Terugbetaald"
}
const TICKET_STATUS: Record<string, string> = {
  intake: "Nieuw",
  in_progress: "Bezig",
  awaiting_reply: "Wacht op antwoord",
  done: "Klaar"
}
const PRIORITY: Record<string, string> = { high: "Hoog", medium: "Gemiddeld", low: "Laag" }
const CB_STATUS: Record<string, string> = {
  open: "Open",
  awaiting_evidence: "Wacht op bewijs",
  submitted: "Ingediend",
  won: "Gewonnen",
  lost: "Verloren"
}
const FLOW_STATUS: Record<string, string> = { active: "Actief", paused: "Gepauzeerd", draft: "Concept" }
const INTEGRATION_STATUS: Record<string, string> = {
  connected: "Gekoppeld",
  disconnected: "Ontkoppeld",
  action_required: "Actie nodig",
  connecting: "Bezig met koppelen"
}
const PROVIDER: Record<string, string> = { klarna: "Klarna", stripe: "Stripe", paypal: "PayPal" }

const money = (v: number, currency = "USD") => new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(v)

/** The record a note is about, from the demo stores, with its primary act. */
export function useDemoRecord(note: Note, open: () => void): NoteRecord {
  const { setRead } = useNotificationsSource()
  const orders = useWorkspace((s) => s.orders)
  const tickets = useWorkspace((s) => s.tickets)
  const chargebacks = useWorkspace((s) => s.chargebacks)
  const members = useWorkspace((s) => s.members)
  const integrations = useWorkspace((s) => s.integrations)
  const queue = useWorkspace((s) => s.queue)
  const workflows = useWorkflows()
  const [busy, setBusy] = useState(false)
  const ref = note.ref

  let facts: NoteRecord["facts"] = [...(note.facts ?? [])]
  let primary: NotePrimary = { label: "Openen", run: open }
  let missing = false

  if (ref?.type === "order") {
    const o = orders.find((x) => x.id === ref.id)
    if (o) {
      facts = [
        ["Bestelling", o.number],
        ["Klant", o.customer_name],
        ["Totaal", money(o.total, o.currency)],
        ["Status", ORDER_STATUS[o.status] ?? o.status],
        ["Artikelen", String(o.line_items.reduce((n, l) => n + l.quantity, 0))]
      ]
    } else missing = true
    primary = { label: "Bestelling openen", run: open }
  } else if (ref?.type === "ticket") {
    const t = tickets.find((x) => x.id === ref.id)
    if (t) {
      facts = [
        ["Ticket", t.number],
        ["Onderwerp", t.title],
        ["Status", TICKET_STATUS[t.status] ?? t.status],
        ["Prioriteit", PRIORITY[t.priority] ?? t.priority]
      ]
    } else missing = true
    primary = { label: "Ticket openen", run: open }
  } else if (ref?.type === "chargeback") {
    const c = chargebacks.find((x) => x.id === ref.id)
    if (c) {
      facts = [
        ["Zaak", `${c.case_number} · ${PROVIDER[c.provider] ?? c.provider}`],
        ["Klant", c.customer_name],
        ["Bedrag", money(c.amount, c.currency)],
        ["Reden", c.reason],
        ["Status", CB_STATUS[c.status] ?? c.status]
      ]
    } else missing = true
    primary = { label: "Chargeback openen", run: open }
  } else if (ref?.type === "automation") {
    const w = workflows[ref.id]
    if (w) {
      facts = [
        ["Flow", w.name],
        ["Status", FLOW_STATUS[w.status] ?? w.status],
        ["Uitvoeringen", w.runs.toLocaleString("nl-NL")]
      ]
    }
    primary = { label: "Flow openen", run: open }
  } else if (ref?.type === "proposal") {
    const q = queue.find((x) => x.id === ref.id)
    if (q) {
      facts = [
        ["Voorstel", q.plate?.heading ?? q.title],
        ["Op het spel", q.value],
        ["Termijn", q.due],
        ["Staat", q.state === "open" ? "Getekend, niet uitgevoerd" : q.state === "filed" ? "Uitgevoerd" : "Genegeerd"]
      ]
      primary = q.state === "open"
        ? {
          label: q.plate?.fileLabel ?? "Uitvoeren",
          run: () => {
            const ws = useWorkspace.getState()
            ws.fileQueue(q.id)
            setRead([note.id], true)
            undoable(
              `${q.plate?.heading ?? "Voorstel"} uitgevoerd`,
              () => ws.restoreQueue(q.id, "open"),
              q.plate?.after.value
            )
          }
        }
        : { label: "Op Start bekijken", run: open, done: q.state === "filed" ? "Uitgevoerd" : "Genegeerd" }
    } else missing = true
  } else if (ref?.type === "member") {
    const m = members.find((x) => x.id === ref.id)
    if (m) {
      facts = [
        ["Naam", m.name],
        ["E-mail", m.email],
        ["Rol", m.role],
        ["Status", m.status === "invited" ? "Uitgenodigd" : "Actief"]
      ]
      primary = m.status === "invited"
        ? {
          label: "Uitnodiging opnieuw versturen",
          run: () => {
            useWorkspace.getState().resendInvite(m.id)
            setRead([note.id], true)
            toast.success(`Uitnodiging opnieuw verstuurd naar ${m.email}`)
          }
        }
        : { label: "Team openen", run: open }
    } else missing = true
  } else if (ref?.type === "integration") {
    const i = integrations.find((x) => x.key === ref.key)
    if (i) {
      facts = [
        ["Koppeling", i.name],
        ["Status", INTEGRATION_STATUS[i.status] ?? i.status],
        ["Laatst gesynchroniseerd", i.syncedAt ? fullTime(i.syncedAt) : "Nog niet"]
      ]
      const act = async (verb: "connect" | "sync") => {
        setBusy(true)
        const ws = useWorkspace.getState()
        await (verb === "connect" ? ws.connectIntegration(i.key) : ws.syncIntegration(i.key))
        setBusy(false)
        setRead([note.id], true)
        toast.success(verb === "connect" ? `${i.name} is weer gekoppeld` : `${i.name} is opnieuw gesynchroniseerd`)
      }
      primary = i.status !== "connected"
        ? {
          label: i.status === "connecting" ? "Bezig met koppelen" : "Opnieuw koppelen",
          run: () => act("connect"),
          busy: busy || i.status === "connecting"
        }
        : note.event === "integration.sync"
        ? { label: "Opnieuw synchroniseren", run: () => act("sync"), busy }
        : { label: "Koppelingen openen", run: open }
    }
  } else if (ref?.type === "conversation") {
    // The answer is the primary act here; opening the channel is the way out.
    primary = { label: "Chat openen", run: open, quiet: true }
  }

  return { facts, primary, missing }
}

/** The answer under a mention in a chat, posted to the demo's chat store. */
export function DemoReply({ note, conversation, name }: { note: Note; conversation: string; name: string }) {
  const appendMessage = useChatStore((s) => s.appendMessage)
  const { setRead } = useNotificationsSource()
  const [text, setText] = useState("")
  // A new notification starts a new answer.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset per note
  useEffect(() => setText(""), [note.id])
  const send = () => {
    const body = text.trim()
    if (!body) return
    appendMessage(conversation, {
      id: `m_${Date.now()}`,
      conversation_id: conversation,
      sender_id: "u_elena",
      sender_name: "Elena Hart",
      body,
      at: new Date().toISOString()
    })
    setText("")
    setRead([note.id], true)
    toast.success(`Verstuurd in ${name}`)
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-paper p-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            send()
          }
        }}
        rows={3}
        placeholder={`Antwoord in ${name}`}
        aria-label={`Antwoord in ${name}`}
        className="w-full resize-none rounded-md bg-transparent px-2 py-1.5 text-base text-ink outline-none placeholder:text-ink-3"
      />
      <div className="flex items-center justify-between gap-2 pl-2">
        <span className="text-ink-3 text-xs">⌘ Enter verstuurt</span>
        <button
          type="button"
          onClick={send}
          disabled={!text.trim()}
          className="flex h-8 items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-mesh-ink text-sm shadow-primary transition-colors hover:bg-abyss-2 disabled:pointer-events-none disabled:bg-ink/8 disabled:text-ink-3 disabled:shadow-none"
        >
          <Send className="size-3.5" strokeWidth={1.75} />
          Versturen
        </button>
      </div>
    </div>
  )
}

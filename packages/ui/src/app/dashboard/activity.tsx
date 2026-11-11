import { useMemo, useState } from "react"
import { type AgentLogEntry, ranUnder } from "../lib/agent-log"
import { formatCurrency } from "../lib/format"
import { seedActivity } from "../lib/home/activity"
import { heard, type Note, type NoteSource } from "../lib/notifications"
import { actorName, useNow } from "../notifications/note-parts"
import { useAgentEntries } from "../stores/agent-log-store"
import { type LiveOrder, useLive } from "../stores/live-store"
import { useNotifications } from "../stores/notifications-store"
import { ActivityView } from "./activity-view"

/** Activiteit in the demo: its notes, its seeded team rows, the live orders and the agent log (`activity-view.tsx`). */

const fromLive = (o: LiveOrder): Note => ({
  id: o.id,
  persona: "admin",
  source: "order",
  event: "order.note",
  actor: { kind: "brand", brand: "shopify", name: "Shopify" },
  title: "nieuwe bestelling",
  record: o.number,
  detail: `${o.customer} · ${o.qty} × ${o.title} · ${formatCurrency(o.total, "USD")}`,
  to: `/products/${o.productId}`,
  at: new Date(o.at).toISOString(),
  read: true,
  state: "inbox"
})

/** An agent log row, as a line in the feed: Insyte's star, the sentence, the setting it ran under. */
const fromAgent = (e: AgentLogEntry): Note => ({
  id: `agent_${e.id}`,
  persona: "admin",
  source: "insyte",
  event: "insyte.action",
  actor: { kind: "insyte" },
  title: e.sentence.charAt(0).toLowerCase() + e.sentence.slice(1),
  detail: `${
    e.status === "undone"
      ? `Ongedaan gemaakt door ${e.undoneBy ?? "een collega"}`
      : e.status === "failed"
      ? (e.failReason ?? "Mislukt")
      : ranUnder(e)
  } · ${e.trigger}`,
  tone: e.status === "failed" ? "red" : undefined,
  to: "/ask/activity",
  search: { row: e.id },
  at: e.at,
  read: true,
  state: "inbox"
})

export function ActivityFeed() {
  const now = useNow(30_000)
  const notes = useNotifications((s) => s.notes)
  const prefs = useNotifications((s) => s.prefs)
  const live = useLive((s) => s.orders)
  const agent = useAgentEntries()
  const [who, setWho] = useState<string>("all")
  const [source, setSource] = useState<NoteSource | "all">("all")
  const [limit, setLimit] = useState(60)

  const feed = useMemo(() => {
    const own = notes.filter((n) => n.persona === "admin" && heard(n, prefs))
    return [...own, ...seedActivity(), ...live.map(fromLive), ...agent.slice(0, 300).map(fromAgent)].toSorted((a, b) =>
      Date.parse(b.at) - Date.parse(a.at)
    )
  }, [notes, prefs, live, agent])

  const people = useMemo(() => {
    const by = new Map<string, number>()
    for (const n of feed) {
      const name = actorName(n)
      if (name) by.set(name, (by.get(name) ?? 0) + 1)
    }
    return [...by].toSorted((a, b) => b[1] - a[1])
  }, [feed])
  const sources = useMemo(() => [...new Set(feed.map((n) => n.source))], [feed])

  const rows = feed.filter((n) => (who === "all" || actorName(n) === who) && (source === "all" || n.source === source))
  return (
    <ActivityView
      now={now}
      rows={rows.slice(0, limit)}
      total={rows.length}
      people={people.map(([p, n]) => [p, p, n] as const)}
      sources={sources}
      who={who}
      onWho={setWho}
      source={source}
      onSource={setSource}
      onMore={() => setLimit((l) => l + 60)}
    />
  )
}

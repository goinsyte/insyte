import type { ReactNode } from "react"
import { type CustomerAgentSettings, nextOpenLabel } from "../lib/customer-agent"
import { type Article, publishedVersion } from "../lib/knowledge"
import { undoable } from "../lib/undo"
import { useGate } from "../stores/access-store"
import { useAutonomy, workspaceSpent } from "../stores/autonomy-store"
import { AGENT_TODAY, useCustomerAgent } from "../stores/customer-agent-store"
import { useKnowledge } from "../stores/knowledge-store"
import { type CustomerAgentSource, CustomerAgentSourceProvider, type TestMsg } from "./customer-agent-source"

const words = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 3)

/** The answer the agent would give from the published chapters, with the one it used; or a handover. */
function answer(q: string, articles: ReadonlyArray<Article>, s: CustomerAgentSettings): TestMsg {
  const when = nextOpenLabel(s.hours, new Date())
  const handover = (why: string): TestMsg => ({
    from: "insyte",
    text: s.handoverMessage.replace("{wanneer}", when === "nu" ? "vandaag nog" : when),
    source: why,
    handover: true
  })
  if (/geld terug|terugbetal|refund|korting krijg/i.test(q)) {
    return handover("Overgedragen: geld beloven doet Insyte nooit")
  }
  if (s.handover.asksPerson && /mens|medewerker|collega|iemand spreken|bellen/i.test(q)) {
    return handover("Overgedragen: de klant vraagt om een mens")
  }
  const topic = s.handover.topics.find((t) => q.toLowerCase().includes(t.replace(/en$/, "")))
  if (topic) return handover(`Overgedragen: ${topic} is altijd voor een collega`)
  const qw = new Set(words(q))
  let best: { a: Article; score: number; section: string } | null = null
  for (const a of articles) {
    const pub = publishedVersion(a)
    if (!pub || a.audience === "assistant") continue
    for (const section of pub.body.split(/\n(?=## )/)) {
      const score = words(`${a.title} ${section}`).filter((w) => qw.has(w)).length
      if (score > (best?.score ?? 1)) best = { a, score, section }
    }
  }
  if (!best) {
    return handover("Overgedragen: niet in de kennisbank; van een echte klant komt de vraag bij Nog niet beantwoord")
  }
  const text = best.section.replace(/^## .*\n+/, "").replace(/^- /gm, "• ").trim()
  return { from: "insyte", text, source: `Uit Kennisbank: ${best.a.title} · versie ${publishedVersion(best.a)?.n}` }
}

/** The design app's Klantagent: its customer-agent store, the autonomy store's policy and budget, its knowledge base. */
function useDemoCustomerAgentSource(): CustomerAgentSource {
  const settings = useCustomerAgent((s) => s.settings)
  const spent = useAutonomy(workspaceSpent)
  const sendReply = useAutonomy((s) => s.policy.SendReply)
  const settingsGate = useGate("settings", 3)
  const aiGate = useGate("ai.autonomy")
  const articles = useKnowledge((s) => s.articles)
  return {
    settings,
    today: AGENT_TODAY,
    sendReply,
    webchatDetail: "Northwind EU",
    spent,
    gate: !settingsGate.ok ? settingsGate : aiGate,
    save: (next, said) => {
      const undo = useCustomerAgent.getState().save(next)
      undoable(said, undo, next.on ? "Nieuwe gesprekken volgen deze regels." : "Nieuwe gesprekken gaan naar de inbox.")
      return Promise.resolve(true)
    },
    test: (text, s) => Promise.resolve(answer(text, articles, s))
  }
}

/** The design app's provider around the page. */
export function DemoCustomerAgentSource({ children }: { children: ReactNode }) {
  return <CustomerAgentSourceProvider value={useDemoCustomerAgentSource()}>{children}</CustomerAgentSourceProvider>
}

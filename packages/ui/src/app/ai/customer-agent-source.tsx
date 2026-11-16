import { createContext, useContext } from "react"
import type { AgentDay, CustomerAgentSettings } from "../lib/customer-agent"

/** A line in the test chat: the shopper's question, or what the agent would say and where it came from. */
export type TestMsg = { from: "shopper" | "insyte"; text: string; source?: string; handover?: boolean }

/**
 * What Instellingen → Insyte AI → Klantagent reads and does, from whoever hosts it (as `limits-source.tsx` is for
 * Limieten): the design app from its customer-agent, autonomy and knowledge stores, the console from `ChannelAgent.get`,
 * `.today`, `.set` and `.test` (M15 step 8). A save says whether it went, with the host's Undo.
 */
export interface CustomerAgentSource {
  /** The settings as saved. */
  settings: CustomerAgentSettings
  today: AgentDay
  /** Zelfstandigheid's "Klant beantwoorden": a channel answers by itself only at `auto`. */
  sendReply: "auto" | "ask" | "never"
  /** Under "Websitechat": the stores it answers for. */
  webchatDetail: string
  /** The workspace's AI budget is spent this month: every new chat goes to the team. */
  spent: boolean
  /** Whether the viewer may change the settings (Instellingen · Beheren and `ai.autonomy`), and why not. */
  gate: { ok: boolean; reason: string }
  save: (next: CustomerAgentSettings, said: string) => Promise<boolean>
  /** "Proberen": what the agent would say to one message on these (unsaved) settings. Nothing is sent. */
  test: (text: string, settings: CustomerAgentSettings) => Promise<TestMsg>
}

const Context = createContext<CustomerAgentSource | null>(null)

export const CustomerAgentSourceProvider = Context.Provider

export function useCustomerAgentSource(): CustomerAgentSource {
  const source = useContext(Context)
  if (source === null) throw new Error("Klantagent needs a CustomerAgentSourceProvider around it.")
  return source
}

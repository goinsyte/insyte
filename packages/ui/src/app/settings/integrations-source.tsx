import { type ComponentType, createContext, type ReactNode, useContext } from "react"

/**
 * What Instellingen → Koppelingen reads and does, from whoever hosts it (as `security-source.tsx` is for Beveiliging):
 * the design app from its workspace store, where Koppelen, synchroniseren and Ontkoppelen are simulated on the page;
 * the console from `Connections.list` (M6), where the page only reads and each row's button opens the page that
 * manages it (Winkels, Meldingen, the inbox, E-mail en domein, Apps). What is designed but not built yet says
 * Binnenkort. The markup is the design's.
 */

export type IntegrationCategory = "Commerce" | "Payments" | "Email" | "Channels" | "Marketing" | "Team" | "AI"

/** `soon`: designed, not built here yet; the row says Binnenkort and offers nothing. */
export type IntegrationState = "connected" | "disconnected" | "action_required" | "connecting" | "soon"

export type ChatChannel = "whatsapp" | "instagram" | "webchat"

export interface IntegrationItem {
  key: string
  /** Its mark: a brand's logo, or `email` / `webchat` for Insyte's own; the key where absent. */
  brand?: string
  name: string
  description: string
  category: IntegrationCategory
  status: IntegrationState
  /** When it last synced, for the connected ones. */
  syncedAt?: string
  /**
   * What needs doing, after the description, for one that needs action (absent: the design's sentence); for a connected
   * one, what Insyte is watching (a warning), in place of when it last synced.
   */
  attention?: string
  /** Where it is managed: its button opens that page (and search) rather than acting here. */
  manage?: { to: string; search?: Record<string, string> }
  /** The button's words where Koppelen or Opnieuw koppelen would not fit (a domain to check, not to connect). */
  action?: string
}

export interface IntegrationsSource {
  integrations: ReadonlyArray<IntegrationItem>
  /** Connects here (the design's simulated approval). Absent: a row's button opens `manage`. */
  connect?: (key: string) => Promise<void>
  /** Syncs here; absent, no sync button. */
  sync?: (key: string) => Promise<void>
  /** Lets go here, with Ongedaan maken through `restore`; absent, the row's button opens `manage`. */
  disconnect?: (key: string) => void
  restore?: (item: IntegrationItem) => void
  /**
   * The chat channels' connect dialog (the design's, over its workspace store); absent, they do not connect here. A
   * slot, so the page loads where no data source is installed (the console).
   */
  ChannelDialog?: ComponentType<{ channel: ChatChannel | null; onClose: () => void }>
}

const IntegrationsContext = createContext<IntegrationsSource | null>(null)

export function IntegrationsSourceProvider({ value, children }: { value: IntegrationsSource; children: ReactNode }) {
  return <IntegrationsContext.Provider value={value}>{children}</IntegrationsContext.Provider>
}

export function useIntegrationsSource(): IntegrationsSource {
  const source = useContext(IntegrationsContext)
  if (source === null) throw new Error("useIntegrationsSource outside an IntegrationsSourceProvider")
  return source
}

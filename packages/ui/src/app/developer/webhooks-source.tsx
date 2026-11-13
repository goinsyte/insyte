import { createContext, type ReactElement, useContext } from "react"
import { Blocked } from "../access/blocked"
import type { Delivery, EndpointState, Health, WebhookEndpoint } from "../lib/webhooks-core"

/**
 * What Instellingen → Webhooks reads and does, from whoever hosts it (as `source.tsx` for API-sleutels): the design app
 * answers from its demo store and simulated deliveries, the console from the server. Every write resolves once it took,
 * with its undo where it has one; a host that refuses says why itself.
 */

export type Undo = () => void

export type EndpointDraft = Pick<
  WebhookEndpoint,
  "url" | "description" | "events" | "apiVersion" | "stores" | "headers" | "retry" | "active"
>

/** Which endpoint, and which of its deliveries, the page has open. */
export type WebhooksSearch = { endpoint?: string; levering?: string }

export interface WebhooksSource {
  endpoints: ReadonlyArray<WebhookEndpoint>
  stores: ReadonlyArray<{ id: string; name: string }>
  can: { edit: { ok: boolean; reason: string } }
  search: WebhooksSearch
  /** Opens an endpoint or a delivery (or the list, with neither). */
  go: (search: WebhooksSearch, options?: { replace?: boolean }) => void
  /** A person's name, for "Gemaakt door". */
  personName: (memberId: string) => string
  /** An endpoint's state and its last day: what the list and the detail's figures say. */
  stats: (endpoint: WebhookEndpoint) => { state: EndpointState; health: Health; avgMs: number | null }
  /** An endpoint's deliveries, newest first. A hook: call it as one. */
  useDeliveries: (endpointId: string) => ReadonlyArray<Delivery>
  /** The delivery the drawer opens, with its body and answer once they are in. A hook. */
  useDelivery: (delivery: Delivery) => Delivery
  /** The signing secret, once it is known here (made, revealed or rotated in this visit). */
  secretOf: (endpointId: string) => string | undefined
  revealSecret: (endpointId: string) => Promise<string | undefined>

  /** Answers the new endpoint's id. */
  create: (draft: EndpointDraft) => Promise<string | undefined>
  update: (id: string, draft: EndpointDraft) => Promise<Undo | undefined>
  /** On clears a switch-off by Insyte too. */
  setActive: (id: string, active: boolean) => Promise<Undo | undefined>
  remove: (id: string) => Promise<Undo | undefined>
  rotateSecret: (id: string) => Promise<Undo | undefined>
  /** Answers the test delivery once it has its result. */
  sendTest: (endpointId: string, event: string) => Promise<Delivery | undefined>
  /** Answers the new delivery once it has its result. */
  redeliver: (deliveryId: string) => Promise<Delivery | undefined>
}

const WebhooksSourceContext = createContext<WebhooksSource | null>(null)

export const WebhooksSourceProvider = WebhooksSourceContext.Provider

export function useWebhooksSource(): WebhooksSource {
  const source = useContext(WebhooksSourceContext)
  if (source === null) throw new Error("A webhooks screen needs a WebhooksSourceProvider around it.")
  return source
}

/** A control as it is when the role may change webhooks; otherwise disabled, with what the role misses. */
export function EditGate(
  { children, className }: { perm?: "integrations"; arg?: 2; className?: string; children: ReactElement }
) {
  const edit = useWebhooksSource().can.edit
  if (edit.ok) return children
  return className === undefined
    ? <Blocked reason={edit.reason}>{children}</Blocked>
    : <Blocked reason={edit.reason} className={className}>{children}</Blocked>
}

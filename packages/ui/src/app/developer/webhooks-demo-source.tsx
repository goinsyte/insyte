import { type ReactNode, useMemo } from "react"
import { endpointState, fallbackName, health, newSecret } from "../lib/developer"
import { useGate } from "../stores/access-store"
import { useDeveloper } from "../stores/developer-store"
import { useWorkspace } from "../stores/workspace-store"
import { type WebhooksSearch, type WebhooksSource, WebhooksSourceProvider } from "./webhooks-source"

/** Who is signed in: the owner of the demo workspace. */
const ME = "mem_elena"

const DAY = 86_400_000

const store = () => useDeveloper.getState()
const find = (id: string) => store().webhooks.find((w) => w.id === id)

/**
 * Webhooks' source in the design app: the demo store and its simulated deliveries, as the screens read them before they
 * had a source. Every change answers its undo as the screens made it then.
 */
export function DemoWebhooksSource(
  { search, go, children }: { search: WebhooksSearch; go: WebhooksSource["go"]; children: ReactNode }
) {
  const endpoints = useDeveloper((s) => s.webhooks)
  const deliveries = useDeveloper((s) => s.deliveries)
  const stores = useWorkspace((s) => s.stores)
  const members = useWorkspace((s) => s.members)
  const edit = useGate("integrations", 2)

  const source: WebhooksSource = {
    endpoints,
    stores,
    can: { edit },
    search,
    go,
    personName: (id) => members.find((m) => m.id === id)?.name ?? fallbackName(id),
    stats: (w) => {
      const ds = deliveries.filter((d) => d.endpointId === w.id)
      const recent = ds.filter((d) => Date.now() - Date.parse(d.at) <= DAY)
      return {
        state: endpointState(w, ds),
        health: health(ds),
        avgMs: recent.length ? Math.round(recent.reduce((n, d) => n + d.ms, 0) / recent.length) : null
      }
    },
    useDeliveries: (endpointId) =>
      useMemo(() => deliveries.filter((d) => d.endpointId === endpointId), [deliveries, endpointId]),
    useDelivery: (delivery) => delivery,
    secretOf: (id) => endpoints.find((w) => w.id === id)?.secret,
    revealSecret: (id) => Promise.resolve(find(id)?.secret),
    create: (draft) => {
      const id = `we_${Date.now().toString(36)}`
      store().addWebhook({
        ...draft,
        id,
        secret: newSecret(),
        failures: 0,
        created_at: new Date().toISOString(),
        created_by: ME
      })
      return Promise.resolve(id)
    },
    update: (id, draft) => {
      const before = find(id)
      store().updateWebhook(id, draft)
      return Promise.resolve(before ? () => useDeveloper.getState().updateWebhook(id, before) : undefined)
    },
    setActive: (id, on) => {
      const w = find(id)
      if (!w) return Promise.resolve(undefined)
      const before = { active: w.active, autoDisabled: w.autoDisabled, failures: w.failures }
      store().updateWebhook(
        id,
        on ? { active: true, autoDisabled: false, failures: w.autoDisabled ? 0 : w.failures } : { active: false }
      )
      return Promise.resolve(() => useDeveloper.getState().updateWebhook(id, before))
    },
    remove: (id) => Promise.resolve(store().removeWebhook(id)),
    rotateSecret: (id) => {
      const { before } = store().rotateSecret(id)
      return Promise.resolve(() => useDeveloper.getState().updateWebhook(id, { secret: before }))
    },
    sendTest: (endpointId, event) => Promise.resolve(store().sendTest(endpointId, event)),
    redeliver: (deliveryId) => Promise.resolve(store().redeliver(deliveryId))
  }

  return <WebhooksSourceProvider value={source}>{children}</WebhooksSourceProvider>
}

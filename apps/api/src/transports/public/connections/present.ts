import { findingSentence, type HealthView, type Incident, triedSentence } from "@insyte/modules/stores/domain/Health"

/* Sync health in the public shape (M17 step 6): times as ISO strings, the sentences the console writes beside the codes. */

const iso = (at: number | null) => (at === null ? null : new Date(at).toISOString())

const incidentV1 = (i: Incident) => ({
  id: i.id,
  kind: i.kind,
  opened_at: new Date(i.openedAt).toISOString(),
  resolved_at: iso(i.resolvedAt),
  summary: findingSentence(i.kind, i.facts),
  facts: {
    ...(i.facts.missing === undefined ? {} : { missing_scopes: i.facts.missing }),
    ...(i.facts.expiresAt === undefined ? {} : { expires_at: new Date(i.facts.expiresAt).toISOString() }),
    ...(i.facts.since === undefined ? {} : { since: new Date(i.facts.since).toISOString() }),
    ...(i.facts.headroom === undefined ? {} : { headroom: i.facts.headroom })
  },
  tried: i.tried.map((t) => ({
    at: new Date(t.at).toISOString(),
    step: t.step,
    outcome: t.outcome,
    since: iso(t.since),
    text: triedSentence(t)
  }))
})

export const healthV1 = (view: HealthView) => ({
  data: view.connections.map((c) => ({
    connection_id: c.connectionId,
    provider: c.provider,
    store_id: c.storeId,
    store_name: c.storeName,
    shop_domain: c.shopDomain,
    state: c.state,
    last_synced_at: iso(c.lastSyncedAt),
    last_delivery_at: iso(c.lastDeliveryAt),
    incidents: c.incidents.map(incidentV1)
  }))
})

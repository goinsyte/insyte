import type { KeyWorkspace } from "@insyte/modules/developer/use-cases/workspace"

/* The key's workspace in the public API's shape (M19.3, `insyte://workspace`): snake_case, times as ISO 8601. */

export const workspaceV1 = (w: KeyWorkspace) => ({
  object: "workspace" as const,
  id: w.id,
  name: w.name,
  plan: w.plan,
  trial_ends_at: w.trialEndsAt?.toISOString() ?? null,
  stores: w.stores.map((s) => ({
    id: s.id,
    name: s.name,
    shop_domain: s.shopDomain,
    status: s.status,
    currency: s.currency
  }))
})

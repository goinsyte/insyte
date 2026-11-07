import { Context, type Effect } from "effect"

/*
 * Product analytics, as a port (17 §5): what the outbox's analytics sink sends. PostHog where the stage has a key
 * (`packages/integrations/posthog`), a captured row where it has none. A capture never fails a write: an adapter that
 * cannot send logs it and answers success.
 */

export interface ProductEvent {
  /** The outbox event it came from, for the sink's once-only bookkeeping and the capture table. */
  readonly outboxId: string
  /** snake_case, as the PostHog project names events: `workspace_created`. */
  readonly event: string
  /** The person, by id only: never an email or a name (17 §5). */
  readonly distinctId: string
  /** `{ workspace: id }` once there is one, so every event groups by workspace. */
  readonly groups?: Record<string, string> | undefined
  readonly properties?: Record<string, unknown> | undefined
}

export class ProductAnalytics extends Context.Service<ProductAnalytics, {
  readonly capture: (event: ProductEvent) => Effect.Effect<void>
}>()("shared/ProductAnalytics") {}

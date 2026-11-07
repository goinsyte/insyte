import { Connect, withConnection } from "@insyte/database/Connect"
import { ProductAnalytics } from "@insyte/modules/shared/domain/ProductAnalytics"
import { Effect, Layer } from "effect"
import { SqlClient } from "effect/sql"

/**
 * The capture adapter for product analytics: an event is a row in `captured_product_events`, on a connection of its
 * own, as `MailerCapture` is for mail. Where the stage has no PostHog key: local, the worker tests, previews. A row
 * that cannot be written is logged; analytics never fails the write behind it.
 */
export const ProductAnalyticsCapture = Layer.effect(
  ProductAnalytics,
  Effect.map(Effect.service(Connect), (connect) =>
    ProductAnalytics.of({
      capture: (event) =>
        withConnection(Effect.flatMap(Effect.service(SqlClient.SqlClient), (sql) =>
          sql`insert into captured_product_events (outbox_id, event, distinct_id, groups, properties)
              values (${event.outboxId}, ${event.event}, ${event.distinctId},
                      ${JSON.stringify(event.groups ?? {})}::jsonb, ${JSON.stringify(event.properties ?? {})}::jsonb)`))
          .pipe(
            Effect.provideService(Connect, connect),
            Effect.asVoid,
            Effect.catch((error) =>
              Effect.logWarning(`product event ${event.event} not captured: ${String(error)}`)
            )
          )
    }))
)

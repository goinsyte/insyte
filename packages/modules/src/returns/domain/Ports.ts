import type { Conflict, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, type Effect } from "effect"
import type { SqlClient, SqlError } from "effect/sql"
import type { AlreadyRefunded, RefundId, RefundOverBalance, RefundOverLimit } from "../../orders/domain/Refunds.ts"

/**
 * Settling a return with a refund (M9.1): the order's refund, on the return's own transaction, as the same person and
 * within their limit; Shopify hears it through the outbox row it answers. The orders slice does it; this is what the
 * returns slice asks of it, composed where the app is put together.
 */
export class Refunder extends Context.Service<Refunder, {
  readonly refund: (
    sql: SqlClient.SqlClient,
    input: {
      readonly orderId: string
      readonly refundId: typeof RefundId.Type
      readonly amountMinor: number
      readonly note: string
    }
  ) => Effect.Effect<
    { readonly outboxId: string | null },
    RefundOverLimit | RefundOverBalance | AlreadyRefunded | NotFound | Conflict | SqlError.SqlError,
    CurrentPrincipal
  >
}>()("returns/Refunder") {}

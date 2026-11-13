import { ReturnsTools } from "@insyte/api/mcp/tools/ReturnsTools"
import { Effect, Layer } from "effect"
import { governed, type Plan, token } from "../mcp/Governance.ts"
import { kicker } from "../mcp/Outbox.ts"
import { ReturnsV1 } from "./ReturnsV1.ts"

export const ReturnsMcp = ReturnsTools.toLayer(Effect.gen(function*() {
  const read = yield* ReturnsV1
  const kicking = yield* kicker
  const returnSubject = (id: string) =>
    Effect.map(read.returnOne(id), (r) => ({
      record: r,
      subject: { type: "return", id: r.id, label: r.number },
      storeId: r.store_id
    }))
  return {
    list_returns: ({ status }) => read.returns(status),
    get_return: ({ return_id }) => read.returnOne(return_id),
    start_return: ({ idempotency_key, ...body }) => kicking(read.startReturn(body, idempotency_key)),
    approve_return: ({ return_id, idempotency_key, keep_item }) =>
      governed(
        "approve_return",
        idempotency_key,
        Effect.map(returnSubject(return_id), ({ record, subject, storeId }): Plan<unknown> => ({
          action: "ApproveReturn",
          storeId,
          subject,
          sentence: `Retour ${record.number} goedgekeurd`,
          ask: {
            _tag: "ApproveReturn",
            returnId: return_id,
            ...(keep_item === undefined ? {} : { keepItem: keep_item })
          },
          effect: token
        })),
        kicking(read.moveReturn(return_id, { kind: "approve", keep_item }, idempotency_key))
      ),
    reject_return: ({ return_id, idempotency_key, reason }) =>
      kicking(read.moveReturn(return_id, { kind: "reject", reason }, idempotency_key)),
    send_return_label: ({ return_id, idempotency_key }) =>
      governed(
        "send_return_label",
        idempotency_key,
        Effect.map(returnSubject(return_id), ({ record, subject, storeId }): Plan<unknown> => ({
          action: "SendReturnLabel",
          storeId,
          subject,
          sentence: `Retourlabel voor ${record.number} verstuurd`,
          ask: { _tag: "SendReturnLabel", returnId: return_id },
          effect: token
        })),
        kicking(read.labelReturn(return_id, idempotency_key))
      ),
    add_return_tracking: ({ return_id, idempotency_key, carrier, tracking }) =>
      read.trackReturn(return_id, { carrier, tracking }, idempotency_key),
    receive_return: ({ return_id, idempotency_key }) =>
      kicking(read.moveReturn(return_id, { kind: "receive" }, idempotency_key)),
    inspect_return: ({ return_id, idempotency_key, lines }) =>
      kicking(read.moveReturn(return_id, { kind: "inspect", lines }, idempotency_key)),
    resolve_return: ({ return_id, idempotency_key, resolution }) =>
      governed(
        "resolve_return",
        idempotency_key,
        Effect.map(returnSubject(return_id), ({ record, subject, storeId }): Plan<unknown> => ({
          // Settling with money is a refund; the other settlements change nothing outside Insyte yet.
          action: resolution === "refund" ? "RefundOrder" : "ApproveReturn",
          storeId,
          subject,
          sentence: `Retour ${record.number} afgehandeld`,
          ask: { _tag: "ResolveReturn", returnId: return_id, resolution },
          effect: token
        })),
        kicking(read.resolveReturn(return_id, { resolution }, idempotency_key))
      )
  }
})).pipe(Layer.provide(ReturnsV1.layer))

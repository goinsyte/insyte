import { CurrentPrincipal } from "@insyte/domain/Principal"
import type { ReturnRow } from "@insyte/modules/returns/domain/Returns"
import { ReturnsService } from "@insyte/modules/returns/Returns"
import * as Idempotency from "@insyte/modules/shared/use-cases/Idempotency"
import { Context, Effect, Layer } from "effect"
import { conflict, notFound, refundV1, scopeMissing, validation, type WriteRefusal, writeV1 } from "../shared/errors.ts"
import { refundIdOf } from "../shared/refunds.ts"
import { returnDetailV1, returnPageV1, returnV1 } from "./present.ts"

/*
 * Returns and claims (M9, M19.2, M19.3): the queue, one return, and every move from starting one to settling it, each
 * once per `Idempotency-Key`.
 */

/** The returns refusals in the V1 envelope: a move the status does not allow is a conflict, a line refused invalid. */
const returnsV1 = (
  e:
    | WriteRefusal
    | { readonly _tag: "IllegalReturnMove"; readonly from: string }
    | { readonly _tag: "ResolutionNotAllowed" }
    | { readonly _tag: "LineNotReturnable"; readonly why: string }
) => {
  switch (e._tag) {
    case "IllegalReturnMove":
      return conflict(`status_${e.from}`)
    case "ResolutionNotAllowed":
      return conflict("resolution_not_allowed")
    case "LineNotReturnable":
      return validation({ lines: e.why })
    default:
      return writeV1(e)
  }
}

/** The same for a label: no carrier set up, or no address to make one with, is a conflict. */
const labelV1 = (
  e:
    | WriteRefusal
    | { readonly _tag: "IllegalReturnMove"; readonly from: string }
    | { readonly _tag: "LabelsUnavailable" }
    | { readonly _tag: "LabelNotPossible"; readonly why: string }
) =>
  e._tag === "LabelsUnavailable"
    ? conflict("labels_unavailable")
    : e._tag === "LabelNotPossible"
    ? conflict(e.why)
    : returnsV1(e)

/** The same for settling one, which may refund. */
const resolveV1 = (
  e:
    | WriteRefusal
    | { readonly _tag: "IllegalReturnMove"; readonly from: string }
    | { readonly _tag: "ResolutionNotAllowed" }
    | { readonly _tag: "RefundOverLimit"; readonly limitMinor: number }
    | { readonly _tag: "RefundOverBalance" }
    | { readonly _tag: "AlreadyRefunded" }
) => e._tag === "IllegalReturnMove" || e._tag === "ResolutionNotAllowed" ? returnsV1(e) : refundV1(e)

const make = Effect.gen(function*() {
  const returns = yield* ReturnsService
  return {
    returns: (status?: ReturnRow["status"]) =>
      returns.list({}).pipe(
        Effect.map((list) => returnPageV1(list, status)),
        Effect.catchTag("Forbidden", scopeMissing)
      ),
    returnOne: (id: string) =>
      returns.get(id).pipe(
        Effect.map(returnDetailV1),
        Effect.catchTags({ Forbidden: scopeMissing, NotFound: notFound })
      ),
    startReturn: (
      body: {
        readonly order_id: string
        readonly lines: ReadonlyArray<{ readonly line_id: string; readonly quantity: number }>
        readonly reason_id: string
        readonly requested_resolution: ReturnRow["requested"]
        readonly note?: string | undefined
        readonly exchange_to?: string | undefined
      },
      key?: string
    ) =>
      Idempotency.once(
        key,
        ["return.start", body],
        Effect.map(
          returns.start({
            orderId: body.order_id,
            lines: body.lines.map((l) => ({ lineId: l.line_id, qty: l.quantity })),
            reasonId: body.reason_id,
            requested: body.requested_resolution,
            ...(body.note === undefined ? {} : { note: body.note }),
            ...(body.exchange_to === undefined ? {} : { exchangeTo: body.exchange_to })
          }),
          (change) => returnV1(change.returns[0]!)
        )
      ).pipe(Effect.catch(returnsV1)),
    moveReturn: (
      id: string,
      move:
        | { readonly kind: "approve"; readonly keep_item?: boolean | undefined }
        | { readonly kind: "reject"; readonly reason: string }
        | { readonly kind: "receive" }
        | {
          readonly kind: "inspect"
          readonly lines?:
            | ReadonlyArray<
              { readonly line_id: string; readonly condition: "ok" | "damaged" | "missing"; readonly restock: boolean }
            >
            | undefined
        },
      key?: string
    ) =>
      Idempotency.once(
        key,
        ["return", id, move],
        Effect.flatMap(
          move.kind === "approve"
            ? returns.approve({ ids: [id], ...(move.keep_item === undefined ? {} : { keepItem: move.keep_item }) })
            : move.kind === "reject"
            ? returns.reject({ ids: [id], reason: move.reason })
            : move.kind === "receive"
            ? returns.markReceived(id)
            : returns.inspect({
              id,
              ...(move.lines === undefined ? {} : {
                lines: move.lines.map((l) => ({ lineId: l.line_id, condition: l.condition, restock: l.restock }))
              })
            }),
          () => Effect.map(returns.get(id), (d) => returnV1(d.record))
        )
      ).pipe(Effect.catch(returnsV1)),
    trackReturn: (
      id: string,
      body: { readonly carrier: "PostNL" | "DHL" | "DPD" | "UPS"; readonly tracking: string },
      key?: string
    ) =>
      Idempotency.once(
        key,
        ["return.tracking", id, body],
        Effect.flatMap(
          returns.addTracking({ id, carrier: body.carrier, tracking: body.tracking }),
          () => Effect.map(returns.get(id), (d) => returnV1(d.record))
        )
      ).pipe(Effect.catch(returnsV1)),
    labelReturn: (id: string, key?: string) =>
      Idempotency.once(
        key,
        ["return.label", id],
        Effect.flatMap(returns.sendLabel({ ids: [id] }), () => Effect.map(returns.get(id), (d) => returnV1(d.record)))
      ).pipe(Effect.catch(labelV1)),
    resolveReturn: (
      id: string,
      body: { readonly resolution: ReturnRow["requested"]; readonly exchange_to?: string | undefined },
      key?: string
    ) =>
      Effect.gen(function*() {
        const principal = yield* CurrentPrincipal
        const refundId = yield* refundIdOf(key, principal.id)
        return yield* Idempotency.once(
          key,
          ["return.resolve", id, body],
          Effect.map(
            returns.resolve({
              id,
              resolution: body.resolution,
              ...(body.resolution === "refund" ? { refundId } : {}),
              ...(body.exchange_to === undefined ? {} : { exchangeTo: body.exchange_to })
            }),
            (change) => returnV1(change.returns[0]!)
          )
        )
      }).pipe(Effect.catch(resolveV1))
  }
})

/**
 * Returns, as the key the door let in.
 *
 * @effect-expect-leaking CurrentPrincipal CurrentApiKey Db
 */
export class ReturnsV1 extends Context.Service<ReturnsV1, Effect.Success<typeof make>>()("api-worker/ReturnsV1") {
  static readonly layer = Layer.effect(this, make).pipe(Layer.provide(ReturnsService.layer))
}

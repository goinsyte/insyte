import { Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import {
  CheckIdInput,
  DeliverableMissing,
  IllegalCheckMove,
  LinkExpired,
  NoSupplier,
  ProductIdInput,
  QualityChange,
  QualityView,
  RejectInput,
  RequestInput,
  SetPhaseInput,
  SubmitInput,
  SupplierCheck,
  SupplierLink,
  SupplierTokenInput
} from "@insyte/modules/quality/domain/Quality"
import { PortalRateLimited } from "@insyte/modules/returns/domain/Portal"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { Shopper } from "./Shopper.ts"
import { WithDb } from "./WithDb.ts"

/**
 * Product quality (M9.4): a product's checks, complaints, rate and phase; asking its supplier for a check (with Undo),
 * judging what came back (with Undo), the phase (with Undo), and the link the supplier answers through.
 */
export class QualityRpcs extends RpcGroup.make(
  Rpc.make("Quality.list", {
    payload: ProductIdInput,
    success: QualityView,
    error: Schema.Union([Forbidden, NotFound])
  }),
  Rpc.make("Quality.request", {
    payload: RequestInput,
    success: QualityChange,
    error: Schema.Union([Forbidden, NotFound, Invalid, NoSupplier])
  }),
  Rpc.make("Quality.approve", {
    payload: CheckIdInput,
    success: QualityChange,
    error: Schema.Union([Forbidden, NotFound, IllegalCheckMove])
  }),
  Rpc.make("Quality.reject", {
    payload: RejectInput,
    success: QualityChange,
    error: Schema.Union([Forbidden, NotFound, IllegalCheckMove])
  }),
  Rpc.make("Quality.setPhase", {
    payload: SetPhaseInput,
    success: QualityChange,
    error: Schema.Union([Forbidden, NotFound])
  }),
  Rpc.make("Quality.link", { payload: CheckIdInput, success: SupplierLink, error: Schema.Union([Forbidden, NotFound]) })
)
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}

/**
 * A quality check answered by its supplier through the signed link, `/kwaliteit/<id>?k=<token>` (M9.4), without an
 * account. Media go up beside it, `PUT /api/quality/media`.
 */
export class QualityLinkRpcs extends RpcGroup.make(
  Rpc.make("QualityLink.check", { payload: SupplierTokenInput, success: SupplierCheck, error: LinkExpired }),
  Rpc.make("QualityLink.submit", {
    payload: SubmitInput,
    success: Schema.Struct({ submittedAt: Schema.Finite }),
    error: Schema.Union([LinkExpired, Invalid, IllegalCheckMove, DeliverableMissing, PortalRateLimited])
  })
).middleware(Shopper).middleware(WithDb) {}

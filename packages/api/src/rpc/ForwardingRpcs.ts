import { Conflict, Forbidden, NotFound } from "@insyte/domain/Errors"
import { CustomerDraft } from "@insyte/modules/forwarding/domain/CustomerDraft"
import {
  ForwardingChange,
  ForwardInput,
  IdsInput,
  LegList,
  LegRow,
  ListInput,
  RerouteInput
} from "@insyte/modules/forwarding/domain/Forwarding"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

/**
 * Doorsturen (M8.2): the queue by view with its counts, an order's legs, and the commands on legs (Bestellingen at
 * Bewerken), each with an undo token. "Klant mailen" reads Insyte's draft for a leg's shopper (Bekijken); sending it is
 * `Orders.emailCustomer`.
 */
export class ForwardingRpcs extends RpcGroup.make(
  Rpc.make("Forwarding.list", { payload: ListInput, success: LegList, error: Forbidden }),
  Rpc.make("Forwarding.forOrder", {
    payload: Schema.Struct({ orderId: Schema.String }),
    success: Schema.Array(LegRow),
    error: Forbidden
  }),
  Rpc.make("Forwarding.forward", {
    payload: ForwardInput,
    success: ForwardingChange,
    error: Schema.Union([Forbidden, NotFound, Conflict])
  }),
  Rpc.make("Forwarding.markConfirmed", {
    payload: IdsInput,
    success: ForwardingChange,
    error: Schema.Union([Forbidden, NotFound])
  }),
  Rpc.make("Forwarding.reroute", {
    payload: RerouteInput,
    success: ForwardingChange,
    error: Schema.Union([Forbidden, NotFound, Conflict])
  }),
  Rpc.make("Forwarding.cancel", {
    payload: IdsInput,
    success: ForwardingChange,
    error: Schema.Union([Forbidden, NotFound])
  }),
  Rpc.make("Forwarding.customerDraft", {
    payload: Schema.Struct({ id: Schema.String }),
    success: CustomerDraft,
    error: Schema.Union([Forbidden, NotFound])
  })
)
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}

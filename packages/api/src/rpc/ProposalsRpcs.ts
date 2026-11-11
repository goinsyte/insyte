import { Forbidden, NotFound } from "@insyte/domain/Errors"
import {
  IdInput,
  ProposalChange,
  ProposalClosed,
  ProposalStale,
  ProposalView
} from "@insyte/modules/proposals/domain/Proposals"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

/**
 * Plates and proposals (M10.2; ADR-0014): one plate, filing it (the command it carries runs as the person, with Undo),
 * setting it aside (with Undo) and drawing it again. A plate is read by whoever may open its record; filing takes the
 * permission the command takes.
 */
export class ProposalsRpcs extends RpcGroup.make(
  Rpc.make("Proposals.get", { payload: IdInput, success: ProposalView, error: NotFound }),
  Rpc.make("Proposals.file", {
    payload: IdInput,
    success: ProposalChange,
    error: Schema.Union([Forbidden, NotFound, ProposalClosed, ProposalStale])
  }),
  Rpc.make("Proposals.discard", {
    payload: IdInput,
    success: ProposalChange,
    error: Schema.Union([NotFound, ProposalClosed])
  }),
  Rpc.make("Proposals.redraw", {
    payload: IdInput,
    success: ProposalChange,
    error: Schema.Union([NotFound, ProposalClosed, ProposalStale])
  })
)
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}

import { Conflict, Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import {
  ApiKeyView,
  CreateKey,
  KeyActivity,
  KeyRef,
  RotateKey,
  UpdateKey,
  WithSecret
} from "@insyte/modules/developer/domain/ApiKey"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

export const Endpoints = Schema.Struct({ api: Schema.NullOr(Schema.String), mcp: Schema.NullOr(Schema.String) })

/**
 * Instellingen → API-sleutels (M19.1): the keys and each key's request log for whoever may see the integrations, and
 * making, rotating and revoking them for whoever manages them. Never reachable by a key itself.
 */
export class DeveloperRpcs extends RpcGroup.make(
  Rpc.make("ApiKeys.list", { success: Schema.Array(ApiKeyView), error: Forbidden }),
  Rpc.make("ApiKeys.activity", { payload: KeyRef, success: KeyActivity, error: Forbidden }),
  Rpc.make("ApiKeys.create", {
    payload: CreateKey,
    success: WithSecret,
    error: Schema.Union([Forbidden, Invalid, NotFound])
  }),
  Rpc.make("ApiKeys.update", {
    payload: UpdateKey,
    success: Schema.Array(ApiKeyView),
    error: Schema.Union([Forbidden, Invalid, NotFound])
  }),
  Rpc.make("ApiKeys.rotate", {
    payload: RotateKey,
    success: WithSecret,
    error: Schema.Union([Forbidden, NotFound, Conflict])
  }),
  Rpc.make("ApiKeys.endGrace", {
    payload: KeyRef,
    success: Schema.Array(ApiKeyView),
    error: Schema.Union([Forbidden, NotFound])
  }),
  Rpc.make("ApiKeys.revoke", {
    payload: KeyRef,
    success: Schema.Array(ApiKeyView),
    error: Schema.Union([Forbidden, NotFound])
  }),
  Rpc.make("ApiKeys.restore", {
    payload: KeyRef,
    success: Schema.Array(ApiKeyView),
    error: Schema.Union([Forbidden, NotFound])
  }),
  /** Where a key is used (M19.2, M19.3): the API's own host, its REST base and its MCP endpoint. Not a secret. */
  Rpc.make("ApiKeys.endpoints", { success: Endpoints })
)
  // Innermost first: `Member` needs the person (`Authenticated`) and the connection (`WithDb`) around it.
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}

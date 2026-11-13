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
import {
  DeliveriesQuery,
  DeliveryRef,
  DeliveryStarted,
  EndpointChange,
  EndpointInput,
  EndpointRef,
  EndpointWithSecret,
  RevealedSecret,
  RotatedSecret,
  SendTest,
  SetActive,
  UpdateEndpoint,
  WebhookDeliveryDetail,
  WebhookDeliveryView,
  WebhookEndpointView
} from "@insyte/modules/developer/domain/Webhook"
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
  Rpc.make("ApiKeys.endpoints", { success: Endpoints }),
  // Instellingen → Webhooks (M19.4): reading takes Koppelingen · Bekijken, every change Bewerken; never by a key.
  Rpc.make("Webhooks.list", { success: Schema.Array(WebhookEndpointView), error: Forbidden }),
  Rpc.make("Webhooks.deliveries", {
    payload: DeliveriesQuery,
    success: Schema.Array(WebhookDeliveryView),
    error: Forbidden
  }),
  Rpc.make("Webhooks.delivery", {
    payload: DeliveryRef,
    success: WebhookDeliveryDetail,
    error: Schema.Union([Forbidden, NotFound])
  }),
  Rpc.make("Webhooks.create", {
    payload: EndpointInput,
    success: EndpointWithSecret,
    error: Schema.Union([Forbidden, Invalid, NotFound])
  }),
  Rpc.make("Webhooks.update", {
    payload: UpdateEndpoint,
    success: EndpointChange,
    error: Schema.Union([Forbidden, Invalid, NotFound])
  }),
  Rpc.make("Webhooks.setActive", {
    payload: SetActive,
    success: EndpointChange,
    error: Schema.Union([Forbidden, NotFound])
  }),
  Rpc.make("Webhooks.remove", {
    payload: EndpointRef,
    success: EndpointChange,
    error: Schema.Union([Forbidden, NotFound])
  }),
  Rpc.make("Webhooks.revealSecret", {
    payload: EndpointRef,
    success: RevealedSecret,
    error: Schema.Union([Forbidden, NotFound])
  }),
  Rpc.make("Webhooks.rotateSecret", {
    payload: EndpointRef,
    success: RotatedSecret,
    error: Schema.Union([Forbidden, NotFound])
  }),
  Rpc.make("Webhooks.sendTest", {
    payload: SendTest,
    success: DeliveryStarted,
    error: Schema.Union([Forbidden, Invalid, NotFound, Conflict])
  }),
  Rpc.make("Webhooks.redeliver", {
    payload: DeliveryRef,
    success: DeliveryStarted,
    error: Schema.Union([Forbidden, NotFound, Conflict])
  })
)
  // Innermost first: `Member` needs the person (`Authenticated`) and the connection (`WithDb`) around it.
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}

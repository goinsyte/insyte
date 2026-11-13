import { Forbidden, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { WebhookEndpointView } from "@insyte/modules/developer/domain/Webhook"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * Instellingen → Webhooks (M19.4): the endpoints, primed by the route's loader and carried in the document; an
 * endpoint's deliveries when its detail opens, and one delivery in full when the drawer does; every change names
 * `WEBHOOKS`, which a `webhook_endpoint` frame (an attempt's result) refetches too.
 */

export const WEBHOOKS = ["webhooks"] as const

export const webhooksAtom = Atom.serializable(
  ConsoleClient.query("Webhooks.list", undefined, { reactivityKeys: WEBHOOKS }),
  {
    key: "webhooks",
    schema: AsyncResult.Schema({
      success: Schema.Array(WebhookEndpointView),
      error: Schema.Union([Forbidden, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])
    }),
    skipInitialRun: true
  }
)

export const deliveriesAtom = Atom.family((endpointId: string) =>
  ConsoleClient.query("Webhooks.deliveries", { endpointId }, { reactivityKeys: WEBHOOKS })
)

export const deliveryAtom = Atom.family((id: string) =>
  ConsoleClient.query("Webhooks.delivery", { id }, { reactivityKeys: WEBHOOKS })
)

export const webhookWrites = {
  create: ConsoleClient.mutation("Webhooks.create"),
  update: ConsoleClient.mutation("Webhooks.update"),
  setActive: ConsoleClient.mutation("Webhooks.setActive"),
  remove: ConsoleClient.mutation("Webhooks.remove"),
  revealSecret: ConsoleClient.mutation("Webhooks.revealSecret"),
  rotateSecret: ConsoleClient.mutation("Webhooks.rotateSecret"),
  sendTest: ConsoleClient.mutation("Webhooks.sendTest"),
  redeliver: ConsoleClient.mutation("Webhooks.redeliver"),
  /** A test's or a redelivery's result, asked for until it is in. */
  delivery: ConsoleClient.mutation("Webhooks.delivery"),
  undo: ConsoleClient.mutation("Shared.undo")
} as const

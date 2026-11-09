import { Conflict, Forbidden, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { MarketingList, MarketingStatus } from "@insyte/modules/marketing/domain/Marketing"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * Klaviyo (M7.5): whether the workspace has an account connected, and its lists, read when the sync dialog opens.
 * Connecting, letting go and a sync name `MARKETING`, so both read again.
 */

export const MARKETING = ["marketing"] as const

const errors = Schema.Union([Forbidden, Conflict, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])

export const marketingStatusAtom = Atom.serializable(
  ConsoleClient.query("Marketing.status", undefined, { reactivityKeys: MARKETING }),
  {
    key: "marketing-status",
    schema: AsyncResult.Schema({
      success: MarketingStatus,
      error: Schema.Union([Forbidden, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])
    }),
    skipInitialRun: true
  }
)

export const marketingListsAtom = Atom.serializable(
  ConsoleClient.query("Customers.marketingLists", undefined, { reactivityKeys: MARKETING }),
  {
    key: "marketing-lists",
    schema: AsyncResult.Schema({ success: Schema.Array(MarketingList), error: errors }),
    skipInitialRun: true
  }
)

export const marketingWrites = {
  beginConnect: ConsoleClient.mutation("Marketing.beginConnect"),
  disconnect: ConsoleClient.mutation("Marketing.disconnect"),
  sync: ConsoleClient.mutation("Customers.syncToMarketing"),
  undo: ConsoleClient.mutation("Shared.undo")
} as const

import { NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { QueueList } from "@insyte/modules/queue/domain/Queue"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * Start's queue (M10.1): every open row the person may open, and what was seen in the last day; the screen draws its
 * own tabs from them. Read on the server with the page, refetched when the queue changes (`queue_item`).
 */

export const QUEUE = ["queue"] as const

export const queueAtom = Atom.serializable(
  ConsoleClient.query("Queue.list", { tab: "all" }, { reactivityKeys: QUEUE }),
  {
    key: "queue",
    schema: AsyncResult.Schema({
      success: QueueList,
      error: Schema.Union([NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])
    }),
    skipInitialRun: true
  }
)

export const queueWrites = {
  markSeen: ConsoleClient.mutation("Queue.markSeen"),
  // The plate on a row (M10.2): filed as the person, or drawn again.
  file: ConsoleClient.mutation("Proposals.file"),
  redraw: ConsoleClient.mutation("Proposals.redraw"),
  undo: ConsoleClient.mutation("Shared.undo")
} as const

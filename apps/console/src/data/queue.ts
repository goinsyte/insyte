import { NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { QueueList, type QueueStoreCounts } from "@insyte/modules/queue/domain/Queue"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"
import { QUEUE } from "./frame.ts"
import { storeKey, withStore } from "./in-view.ts"
import { inView } from "./store-view.ts"

/*
 * Start's queue (M10.1): every open row the person may open, and what was seen in the last day; the screen draws its
 * own tabs from them. Read on the server with the page, refetched when the queue changes (`queue_item`).
 */

export { QUEUE }

export const queueAtom = inView((storeId) =>
  Atom.serializable(
    ConsoleClient.query("Queue.list", withStore({ tab: "all" as const }, storeId), { reactivityKeys: QUEUE }),
    {
      key: `queue@${storeKey(storeId)}`,
      schema: AsyncResult.Schema({
        success: QueueList,
        error: Schema.Union([NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])
      }),
      skipInitialRun: true
    }
  )
)

/**
 * The queue's figures for the store in view, from the frame's counts by store (`Frame.queue`): one store's are its own
 * and the storeless rows, every store's (`null`) are all of them. `undefined` while the store in view is not known.
 */
export const queueCountsIn = (
  byStore: ReadonlyArray<typeof QueueStoreCounts.Type>,
  storeId: string | null | undefined
): { needsYou: number; drawn: number } | undefined => {
  if (storeId === undefined) return undefined
  const rows = storeId === null ? byStore : byStore.filter((r) => r.storeId === storeId || r.storeId === null)
  return rows.reduce((sum, r) => ({ needsYou: sum.needsYou + r.needsYou, drawn: sum.drawn + r.drawn }), {
    needsYou: 0,
    drawn: 0
  })
}

/** Vraag Insyte's welcome: how many open rows are red or amber (the hero's "needs you"); null while unread or refused. */
export const needsOf = (list: QueueList | undefined): number | null => list?.counts.needsYou ?? null

export const queueWrites = {
  markSeen: ConsoleClient.mutation("Queue.markSeen"),
  // The plate on a row (M10.2): filed as the person, or drawn again.
  file: ConsoleClient.mutation("Proposals.file"),
  redraw: ConsoleClient.mutation("Proposals.redraw"),
  undo: ConsoleClient.mutation("Shared.undo")
} as const

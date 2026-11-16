import { Effect } from "effect"
import type * as ChannelsModule from "./channels.ts"
import type * as ChatModule from "./chat.ts"

/*
 * The website chat's use cases (M15 step 8), loaded with the first chat call an isolate sees and not with the inbox
 * that names them (ADR-0041 §3): the api and public Workers' startup has no room for a channel most requests never
 * touch. The mail inbox, the RPC group and the seam's schemas stay eager; only the chat's own code waits. A load that
 * fails is a defect of that call; the next one tries again.
 */

const once = <M>(load: () => Promise<M>) => {
  let loading: Promise<M> | undefined
  return Effect.promise(() =>
    loading ??= load().catch((error: unknown) => {
      loading = undefined
      throw error
    })
  )
}

const chatModule = once(() => import("./chat.ts"))
const channelsModule = once(() => import("./channels.ts"))

/** A chat use case (`chat.ts`), once its module has loaded. */
export const withChat = <A, E, R>(f: (chat: typeof ChatModule) => Effect.Effect<A, E, R>) =>
  Effect.flatMap(chatModule, f)

/** A channel use case (`channels.ts`), once its module has loaded. */
export const withChannels = <A, E, R>(f: (channels: typeof ChannelsModule) => Effect.Effect<A, E, R>) =>
  Effect.flatMap(channelsModule, f)

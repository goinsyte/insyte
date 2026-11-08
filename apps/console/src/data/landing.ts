import { Landing } from "@insyte/modules/members/domain/Landing"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * The invitation landing (M3.4): what one link shows, read on the server by the route's loader and carried in the
 * document, keyed by the link (its id and secret), so two links are two reads. Accepting and the asks are mutations;
 * an ask answers the landing as it now stands.
 */

export const landingKey = (id: string, k: string | undefined) => `${id}.${k ?? ""}`

export const landingAtom = Atom.family((key: string) => {
  const dot = key.indexOf(".")
  const id = key.slice(0, dot)
  const k = key.slice(dot + 1)
  return Atom.serializable(
    ConsoleClient.query("Landing.resolve", k === "" ? { id } : { id, k }, { reactivityKeys: [`landing:${key}`] }),
    {
      key: `landing:${key}`,
      schema: AsyncResult.Schema({ success: Landing, error: RpcClientError.RpcClientError }),
      skipInitialRun: true
    }
  )
})

export const landingWrites = {
  accept: ConsoleClient.mutation("Landing.accept"),
  requestNew: ConsoleClient.mutation("Landing.requestNew"),
  requestSeat: ConsoleClient.mutation("Landing.requestSeat")
} as const

import { Health } from "@insyte/api/rpc/SystemRpcs"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/**
 * What runs where, and whether its database answers: the walking skeleton's proof (15, step 0).
 *
 * Serializable with `skipInitialRun`, so the value the server rendered travels in the document (13 §6). With
 * `AtomRpc.query`'s own `serializationKey` the browser called twice after hydrating; with this wrapper, once. The one
 * left is spike D1: most likely the client runtime atom the query reads turning from Initial to Success as its layer
 * builds, which counts as a dependency change. A cost of one request, not a wrong value.
 */
export const healthAtom = Atom.serializable(ConsoleClient.query("System.health", undefined), {
  key: "system.health",
  schema: AsyncResult.Schema({ success: Health, error: RpcClientError.RpcClientError }),
  skipInitialRun: true
})

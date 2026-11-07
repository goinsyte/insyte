import { createIsomorphicFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import type { Atom } from "effect/reactivity"
import { ProtocolLayer } from "./client.ts"
import { serverProtocol } from "./server-protocol.ts"

/**
 * The registry's starting values (11 §4). On the server: the transport over the `API` binding for this request. In the
 * browser: nothing, so the client keeps its same-origin transport.
 */
export const initialAtoms = createIsomorphicFn()
  .server((): Array<readonly [Atom.Atom<unknown>, unknown]> => [[ProtocolLayer, serverProtocol(getRequest())]])
  .client((): Array<readonly [Atom.Atom<unknown>, unknown]> => [])

import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { serverInput, type ServerList, type TableQuery } from "@insyte/ui/app/lib/server-query"
import { Option } from "effect"
import { AsyncResult, type Atom } from "effect/reactivity"
import { useCallback, useRef, useState } from "react"

/*
 * A list the design's table pages on the server (W3.1): the input the table last asked for, as `serverInput` writes it
 * over the list's whitelist, and the page read for it. The first input is the route's, read ahead on the server, so
 * the first paint is that page; while a next one is read, the page before stays on screen (`fetching`). A read that
 * fails says so (`failed`, with `retry`), and the page on screen is then still another input's: `current` is false, so
 * the table offers no next page from its cursor.
 */

export interface Paged<P> {
  readonly page: P
  /** The page on screen is the one read for the input the table last asked for. */
  readonly current: boolean
  readonly fetching: boolean
  readonly failed: boolean
  readonly retry: () => void
  readonly onQuery: (query: TableQuery) => void
}

export function usePaged<P, E>(
  atomOf: (input: string) => Atom.Atom<AsyncResult.AsyncResult<P, E>>,
  first: { readonly input: string; readonly page: P },
  list: ServerList
): Paged<P> {
  const [input, setInput] = useState(first.input)
  const atom = atomOf(input)
  const result = useAtomValue(atom)
  const refresh = useAtomRefresh(atom)
  const held = useRef({ input: first.input, page: first.page })
  const read = Option.getOrUndefined(AsyncResult.value(result))
  if (input === first.input) held.current = { input, page: first.page }
  else if (read !== undefined && !AsyncResult.isFailure(result)) held.current = { input, page: read }
  const onQuery = useCallback((query: TableQuery) => setInput(JSON.stringify(serverInput(query, list))), [list])
  const own = input === first.input
  return {
    page: held.current.page,
    current: held.current.input === input,
    fetching: !own && (AsyncResult.isInitial(result) || AsyncResult.isWaiting(result)),
    failed: !own && AsyncResult.isFailure(result) && !AsyncResult.isWaiting(result),
    retry: refresh,
    onQuery
  }
}

/** A list's first page as the table asks for it before anything is chosen: the key a route reads ahead. */
export const firstInput = (query: TableQuery, list: ServerList) => JSON.stringify(serverInput(query, list))

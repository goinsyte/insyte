import { useAtomValue } from "@effect/atom-react"
import { serverInput, type ServerList, type TableQuery } from "@insyte/ui/app/lib/server-query"
import { Option } from "effect"
import { AsyncResult, type Atom } from "effect/reactivity"
import { useCallback, useRef, useState } from "react"

/*
 * A list the design's table pages on the server (W3.1): the input the table last asked for, as `serverInput` writes it
 * over the list's whitelist, and the page read for it. The first input is the route's, read ahead on the server, so
 * the first paint is that page; while a next one is read, the page before stays on screen (`fetching`), as does the last
 * one read when a read fails.
 */

export interface Paged<P> {
  readonly page: P
  readonly fetching: boolean
  readonly onQuery: (query: TableQuery) => void
}

export function usePaged<P, E>(
  atomOf: (input: string) => Atom.Atom<AsyncResult.AsyncResult<P, E>>,
  first: { readonly input: string; readonly page: P },
  list: ServerList
): Paged<P> {
  const [input, setInput] = useState(first.input)
  const result = useAtomValue(atomOf(input))
  const held = useRef(first.page)
  const read = Option.getOrUndefined(AsyncResult.value(result))
  if (input === first.input) held.current = first.page
  else if (read !== undefined) held.current = read
  const onQuery = useCallback((query: TableQuery) => setInput(JSON.stringify(serverInput(query, list))), [list])
  return {
    page: input === first.input ? first.page : held.current,
    fetching: input !== first.input && (AsyncResult.isInitial(result) || AsyncResult.isWaiting(result)),
    onQuery
  }
}

/** A list's first page as the table asks for it before anything is chosen: the key a route reads ahead. */
export const firstInput = (query: TableQuery, list: ServerList) => JSON.stringify(serverInput(query, list))

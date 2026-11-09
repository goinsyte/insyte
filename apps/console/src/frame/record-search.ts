import { useAtomValue } from "@effect/atom-react"
import type { SearchHit } from "@insyte/modules/shared/domain/Search"
import { Option } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { useEffect, useRef, useState } from "react"
import { ConsoleClient } from "../data/client.ts"
import { CUSTOMERS } from "../data/customers.ts"
import { ORDERS } from "../data/orders.ts"

/*
 * The palette's records in the console (step 8.4e): `Search.records` over orders and customers for what is typed, a
 * moment after the typing stops. While a search is out the last answer stays, so the list does not blink empty
 * between keystrokes. Nothing is asked for an empty query.
 */

const LIMIT = 8
const WAIT_MS = 150

const searchAtom = Atom.family((q: string) =>
  ConsoleClient.query("Search.records", { q, kinds: ["order", "customer"], limit: LIMIT }, {
    reactivityKeys: [...ORDERS, ...CUSTOMERS]
  })
)

const IDLE: Atom.Atom<AsyncResult.AsyncResult<ReadonlyArray<SearchHit>, unknown>> = Atom.make(
  AsyncResult.success<ReadonlyArray<SearchHit>>([])
)

/* The palette's `RecordHits` (`@insyte/ui/app/shell/source`), restated: this file is held to the strict program, which
   reaches no screen. */
interface RecordHits {
  readonly orders: ReadonlyArray<{ id: string; number: string; customer: string }>
  readonly customers: ReadonlyArray<{ id: string; name: string; email: string }>
}

const NONE: RecordHits = { orders: [], customers: [] }

const hitsOf = (hits: ReadonlyArray<SearchHit>): RecordHits => ({
  orders: hits.filter((h) => h.kind === "order").map((h) => ({
    id: h.id,
    number: h.title,
    customer: h.subtitle ?? ""
  })),
  customers: hits.filter((h) => h.kind === "customer").map((h) => ({
    id: h.id,
    name: h.title,
    email: h.subtitle ?? ""
  }))
})

export function useConsoleRecordSearch(query: string): RecordHits {
  const [q, setQ] = useState(() => query.trim())
  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim()), WAIT_MS)
    return () => clearTimeout(t)
  }, [query])
  const result = useAtomValue(q === "" ? IDLE : searchAtom(q))
  const last = useRef(NONE)
  const hits = Option.getOrUndefined(AsyncResult.value(result))
  if (hits !== undefined) last.current = hitsOf(hits)
  return query.trim() === "" ? NONE : last.current
}

import { useAtomValue } from "@effect/atom-react"
import type { SearchHit } from "@insyte/modules/shared/domain/Search"
import { Option } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { useEffect, useRef, useState } from "react"
import { CHARGEBACKS } from "../data/chargebacks.ts"
import { CHAT_PAGES, CHATS } from "../data/chats.ts"
import { ConsoleClient } from "../data/client.ts"
import { CUSTOMERS } from "../data/customers.ts"
import { ORDERS } from "../data/orders.ts"
import { TICKETS } from "../data/tickets.ts"

/*
 * The palette's records in the console (step 8.4e; tickets, mail threads and chat messages from M11 step 6;
 * chargebacks from M13):
 * `Search.records` for what is typed, a moment after the typing stops. The server leaves out what the role may not see
 * (the inbox for a role without Klantenservice, a DM between others, another store's tickets). While a search is out
 * the last answer stays, so the list does not blink empty between keystrokes. Nothing is asked for an empty query.
 */

const LIMIT = 8
const WAIT_MS = 150

const searchAtom = Atom.family((q: string) =>
  ConsoleClient.query(
    "Search.records",
    { q, kinds: ["order", "customer", "ticket", "thread", "message", "chargeback"], limit: LIMIT },
    { reactivityKeys: [...ORDERS, ...CUSTOMERS, ...TICKETS, ...CHATS, ...CHAT_PAGES, ...CHARGEBACKS] }
  )
)

const IDLE: Atom.Atom<AsyncResult.AsyncResult<ReadonlyArray<SearchHit>, unknown>> = Atom.make(
  AsyncResult.success<ReadonlyArray<SearchHit>>([])
)

/* The palette's `RecordHits` (`@insyte/ui/app/shell/source`), restated: this file is held to the strict program, which
   reaches no screen. */
interface RecordHits {
  readonly orders: ReadonlyArray<{ id: string; number: string; customer: string }>
  readonly customers: ReadonlyArray<{ id: string; name: string; email: string }>
  readonly tickets: ReadonlyArray<{ id: string; number: string; title: string }>
  readonly threads: ReadonlyArray<{ id: string; subject: string; from: string }>
  readonly messages: ReadonlyArray<{ id: string; text: string; where: string; href: string }>
  readonly chargebacks: ReadonlyArray<{ id: string; case_number: string; customer_name: string }>
}

const NONE: RecordHits = { orders: [], customers: [], tickets: [], threads: [], messages: [], chargebacks: [] }

const hitsOf = (hits: ReadonlyArray<SearchHit>): RecordHits => {
  const of = (kind: SearchHit["kind"]) => hits.filter((h) => h.kind === kind)
  return {
    orders: of("order").map((h) => ({ id: h.id, number: h.title, customer: h.subtitle ?? "" })),
    customers: of("customer").map((h) => ({ id: h.id, name: h.title, email: h.subtitle ?? "" })),
    tickets: of("ticket").map((h) => ({ id: h.id, number: h.title, title: h.subtitle ?? "" })),
    threads: of("thread").map((h) => ({ id: h.id, subject: h.title, from: h.subtitle ?? "" })),
    messages: of("message").map((h) => ({ id: h.id, text: h.title, where: h.subtitle ?? "", href: h.href })),
    chargebacks: of("chargeback").map((h) => ({ id: h.id, case_number: h.title, customer_name: h.subtitle ?? "" }))
  }
}

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

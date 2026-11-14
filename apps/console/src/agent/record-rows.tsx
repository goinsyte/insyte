import { useAtomValue } from "@effect/atom-react"
import { AgentLogPage, type ListInput } from "@insyte/modules/agent/domain/AgentLog"
import { AgentLogSourceProvider } from "@insyte/ui/app/ask/agent-log-source"
import { RecentAgentRow, RecordAgentRows } from "@insyte/ui/app/ask/agent-parts"
import type { Order, Product } from "@insyte/ui/app/lib/types/domain"
import type { QualityPicture } from "@insyte/ui/app/quality/source"
import { Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { type ReactNode, useState } from "react"
import { agentRowsAtom } from "../data/agent.ts"
import { useConsoleAgentLogSource } from "./log-source.tsx"

/*
 * Wat Insyte hier deed on a record (M15.6): the design's agent rows on an order, a return and a ticket, the recent
 * "Bestellingen doorgestuurd" row on Doorsturen and the last batch check asked on a product's Kwaliteit tab, each over
 * `AgentLog.list` narrowed to that record or action. The server fences the rows on the viewer's areas and stores
 * (`storeScope`); the row's drawer and its way back are the log page's (`useConsoleAgentLogSource`).
 */

const MINUTE = 60_000

/** The page once it is in; nothing while it is read or when it could not be. */
function usePage(input: ListInput): AgentLogPage | undefined {
  return Option.getOrUndefined(AsyncResult.value(useAtomValue(agentRowsAtom(JSON.stringify(input)))))
}

/** The rows as the log's source, for the design's parts that read it. */
function Provided({ page, children }: { page: AgentLogPage; children: ReactNode }) {
  const source = useConsoleAgentLogSource(page, undefined)
  return <AgentLogSourceProvider value={source}>{children}</AgentLogSourceProvider>
}

/** Drawn only where there is a row: a record the agent never touched shows nothing, as the design's does. */
function WithRows({ input, children }: { input: ListInput; children: ReactNode }) {
  const page = usePage(input)
  if (page === undefined || page.rows.length === 0) return null
  return <Provided page={page}>{children}</Provided>
}

/** Since a moment that holds while the page is open, so the read is not asked again for every second. */
function useSince(within: number) {
  const [since] = useState(() => Math.floor((Date.now() - within) / MINUTE) * MINUTE)
  return since
}

const RECORD_ROWS = 50

/** An order's rows under its timeline. */
export function ConsoleOrderAgentRows({ order }: { order: Order }) {
  return (
    <WithRows input={{ subjectType: "order", subjectId: order.id, limit: RECORD_ROWS }}>
      <RecordAgentRows kind="order" id={order.id} />
    </WithRows>
  )
}

/** A return's rows in its history. */
export function ConsoleReturnAgentRows({ id }: { id: string }) {
  return (
    <WithRows input={{ subjectType: "return", subjectId: id, limit: RECORD_ROWS }}>
      <RecordAgentRows kind="return" id={id} />
    </WithRows>
  )
}

/** A ticket's rows in its modal. */
export function ConsoleTicketAgentRows({ id }: { id: string }) {
  return (
    <WithRows input={{ subjectType: "ticket", subjectId: id, limit: RECORD_ROWS }}>
      <RecordAgentRows kind="ticket" id={id} />
    </WithRows>
  )
}

/** The console asks nothing first on a return yet: the agent's plate comes with its proposals there. */
export const NoReturnProposal = () => null

const HOUR = 60 * MINUTE

/** Doorsturen: the agent's last forwarding, while it is recent, with its undo where the decision was. */
export function ConsoleForwardingRecent() {
  const since = useSince(HOUR)
  return (
    <WithRows input={{ action: "ForwardOrder", since, limit: 1 }}>
      <RecentAgentRow action="ForwardOrder" />
    </WithRows>
  )
}

const DAY = 24 * HOUR

/**
 * Kwaliteit: the last batch check the agent asked on this product, while it is recent. Its row is about the check, so
 * the product's checks pick its rows out.
 */
export function ConsoleQualityAgents({ picture }: { product: Product; picture: QualityPicture }) {
  const since = useSince(DAY)
  const page = usePage({ action: "RequestQualityCheck", subjectType: "quality_check", since, limit: 100 })
  const checks = new Set(picture.checks.map((c) => c.id))
  const rows = page?.rows.filter((r) => r.subject !== null && checks.has(r.subject.id)) ?? []
  if (page === undefined || rows.length === 0) return null
  return (
    <Provided page={new AgentLogPage({ rows, counts: page.counts })}>
      <RecentAgentRow action="RequestQualityCheck" within={DAY} />
    </Provided>
  )
}

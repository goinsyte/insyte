import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { MailboxView, ThreadDetail, ThreadList } from "@insyte/modules/inbox/domain/Inbox"
import type { TicketOptions } from "@insyte/modules/tickets/domain/Tickets"
import { EmptyPage } from "@insyte/ui/app/common/empty-page"
import { useNow } from "@insyte/ui/app/hooks/use-now"
import type { ConnectedMailbox } from "@insyte/ui/app/inbox/connect-mailbox-dialog"
import type { InboxSearch, InboxSource, InboxThread, Letter } from "@insyte/ui/app/inbox/source"
import { Exit, Option } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { useInboxDrafts } from "../ai/drafts.tsx"
import { frameAtom } from "../data/frame.ts"
import { INBOX, inboxWrites, mailboxesAtom, threadAtom } from "../data/inbox.ts"
import { ticketOptionsAtom } from "../data/tickets.ts"
import { failureOf, sayRefusal, useGate } from "../frame/refusals.ts"
import { type Overlay, useInboxWrites } from "./inbox-writes.ts"
import { entryOf, mailboxOf, threadOf, timeOf } from "./thread-of.ts"

/*
 * The inbox screen's source in the console (M11 step 2): `Threads.list` as the design's threads, `Mailboxes.list` as
 * its mailbox bands, `Threads.get` for the letter, the team from the frame, and the server's commands, each shown in
 * the list at once. What the server does not do yet is left out, not made up: the chat channels and the customer agent
 * (M15), Gmail and Outlook (M11 step 1b), attachments (the file store). Insyte's drafts are Insyte AI's
 * (`../ai/drafts.tsx`). A mailbox is connected here, in the console's own dialog, by forwarding.
 */

function value<A>(result: AsyncResult.AsyncResult<A, unknown>): A | undefined {
  return Option.getOrUndefined(AsyncResult.value(result))
}

const NO_OPTIONS = Atom.make(AsyncResult.initial<TicketOptions, never>())

/** The list, with what a command will change laid over it until the server's comes back. */
function useShown(rows: ReadonlyArray<InboxThread>) {
  const [overlays, setOverlays] = useState<ReadonlyArray<Overlay>>([])
  // A new list from the server has every change in it, or has refused it.
  useEffect(() => setOverlays([]), [rows])
  const threads = useMemo(() => overlays.reduce((ts, f) => f(ts), [...rows]), [rows, overlays])
  const show = useCallback((overlay: Overlay) => setOverlays((o) => [...o, overlay]), [])
  const reset = useCallback(() => setOverlays([]), [])
  return { threads, show, reset }
}

/** The first day: no mailbox yet, or one that no mail has reached. */
function ConsoleEmpty({ onCompose, onConnect }: { onCompose: () => void; onConnect: () => void }) {
  const mailboxes = value(useAtomValue(mailboxesAtom)) ?? []
  const first = mailboxes.find((m) => m.status === "connected")
  if (first === undefined) {
    return (
      <EmptyPage
        kind="inbox"
        count="0 berichten"
        title="Nog niets binnen"
        body="Koppel je support-mailbox en je berichten komen hier binnen. Gmail en Outlook volgen later."
        action={{ label: "Mailbox koppelen", onClick: onConnect }}
      />
    )
  }
  return (
    <EmptyPage
      kind="inbox"
      count="0 berichten"
      title="Nog niets binnen"
      body={first.forwardingAddress === null
        ? `Mail aan ${first.address} komt hier binnen.`
        : `Mail aan ${first.address} komt hier binnen zodra je hem doorstuurt naar ${first.forwardingAddress}.`}
      action={{ label: "Nieuwe e-mail", onClick: onCompose }}
      secondary={{ label: "Mailbox koppelen", onClick: onConnect }}
    />
  )
}

/** The screen over `Threads.*`, with the commands the role may use. */
export function useConsoleInboxSource(
  list: ThreadList,
  mailboxes: ReadonlyArray<MailboxView>,
  search: InboxSearch,
  go: (search: InboxSearch) => void,
  connect: () => void,
  openTicket: (id: string) => void
): InboxSource {
  const frame = value(useAtomValue(frameAtom))
  const now = useNow(60_000)
  const gate = useGate("support", 2)
  // The team's labels, as the tickets know them, on top of those already on a thread.
  const options = value(useAtomValue(gate.ok ? ticketOptionsAtom : NO_OPTIONS))
  const rows = useMemo(() => list.rows.map((r) => threadOf(r, now)), [list, now])
  const { threads, show, reset } = useShown(rows)
  const labels = useMemo(
    () => [...new Set([...(options?.labels ?? []), ...list.rows.flatMap((r) => r.labels)])],
    [options, list]
  )
  const writes = useInboxWrites(show, reset, openTicket, labels)
  const me = frame?.me.memberId ?? ""

  const people = useMemo(
    () => frame?.teammates.map((t) => ({ id: t.id, name: t.name, role: t.roleLabel })) ?? [],
    [frame]
  )
  const who = useCallback(
    (memberId: string) =>
      memberId === me ? "Jij" : people.find((p) => p.id === memberId)?.name.split(" ")[0] ?? undefined,
    [me, people]
  )
  const shownMailboxes = useMemo(() => mailboxes.map((m) => mailboxOf(m, now)), [mailboxes, now])

  /**
   * One thread's messages, once `Threads.get` is in. A message still waiting out its undo window, or on its way, is read
   * again every ten seconds until it went or failed: the send says so only through the relay's sweep.
   */
  const useLetter = (t: InboxThread): Letter => {
    const result = useAtomValue(threadAtom(t.id))
    const refresh = useAtomRefresh(threadAtom(t.id))
    const detail: ThreadDetail | undefined = value(result)
    const sending = detail?.messages.some((m) => m.sendState === "scheduled" || m.sendState === "sending") ?? false
    useEffect(() => {
      if (!sending) return
      const timer = setTimeout(refresh, 10_000)
      return () => clearTimeout(timer)
    }, [sending, detail, refresh])
    return useMemo(
      () =>
        detail === undefined
          ? { entries: [], ready: AsyncResult.isFailure(result) }
          : { entries: detail.messages.map((m) => entryOf(m, who)), ready: true },
      [detail, result]
    )
  }

  const Empty = useMemo(
    () => ({ onCompose }: { onCompose: () => void }) => <ConsoleEmpty onCompose={onCompose} onConnect={connect} />,
    [connect]
  )
  const drafts = useInboxDrafts()

  return {
    threads,
    mailboxes: shownMailboxes,
    search,
    go,
    me,
    people,
    useLetter,
    writes,
    gate,
    time: timeOf,
    connect: { onClick: connect },
    Empty,
    drafts
  }
}

/** "Mailbox koppelen" by forwarding: the mailbox made, or the server's refusal said. */
export function useConnectMailbox() {
  const write = useAtomSet(inboxWrites.connect, { mode: "promiseExit" })
  return async (input: { address: string; label: string }): Promise<ConnectedMailbox | undefined> => {
    const exit = await write({ payload: { provider: "forward", ...input }, reactivityKeys: [...INBOX] })
    if (Exit.isSuccess(exit)) {
      toast.success(`${exit.value.label} gekoppeld`)
      return { address: exit.value.address, forwardingAddress: exit.value.forwardingAddress }
    }
    sayRefusal(failureOf(exit), {
      gone: "Die mailbox bestaat niet meer",
      conflicts: {
        address_connected: ["Dat adres is al gekoppeld", "Kies een ander adres, of gebruik de mailbox die er al is."]
      },
      invalid: { address: "Vul een geldig e-mailadres in.", label: "Geef de mailbox een naam." },
      other: (tagged) => {
        if (tagged._tag !== "ProviderUnavailable") return false
        toast.error("Nog niet beschikbaar", { description: "Koppel je mailbox voorlopig door hem door te sturen." })
        return true
      }
    })
    return undefined
  }
}

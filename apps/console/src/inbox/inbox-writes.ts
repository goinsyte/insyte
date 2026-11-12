import { useAtomSet } from "@effect/atom-react"
import type { ThreadChange } from "@insyte/modules/inbox/domain/Inbox"
import type { InboxThread, InboxWrites, Place, Said } from "@insyte/ui/app/inbox/source"
import { undoable } from "@insyte/ui/app/lib/undo"
import { Exit } from "effect"
import { toast } from "sonner"
import { INBOX, inboxWrites } from "../data/inbox.ts"
import { TICKETS } from "../data/tickets.ts"
import { failureOf, type RefusalCopy, sayRefusal } from "../frame/refusals.ts"

/*
 * The inbox's commands in the console (M11 step 2): each the server's, refreshing what names `INBOX`, with "Ongedaan
 * maken" spending the command's undo token. The list shows a change at once; a refused one puts the threads back as
 * the server has them and says why. A reply, a forward and a new mail wait out the undo window on the server
 * (`scheduled`), so Undo means they never left; one that did not go keeps its draft.
 */

const COPY: RefusalCopy = {
  gone: "Dat gesprek bestaat niet meer",
  invalid: {
    body: "Schrijf eerst een antwoord.",
    subject: "Een onderwerp is verplicht.",
    until: "Kies een moment in de toekomst.",
    to: "Er is niemand om op te antwoorden.",
    required: "Vul alles in wat verplicht is."
  },
  other: (tagged) => {
    if (tagged._tag === "MailboxDisconnected") {
      toast.error("Deze mailbox is ontkoppeld", {
        description: "Er gaat niets vanaf tot hij weer gekoppeld is. Je bericht staat er nog."
      })
      return true
    }
    if (tagged._tag === "NoMailbox") {
      toast.error("Er is nog geen mailbox", { description: "Koppel eerst een mailbox om vanaf te versturen." })
      return true
    }
    return false
  }
}

/** What the server says it refused; anything else (the network, a hiccup) as a send that did not go. */
const KNOWN = new Set(["Forbidden", "Invalid", "NotFound", "Conflict", "MailboxDisconnected", "NoMailbox"])

const refused = (error: unknown) => sayRefusal(error, COPY)

const unsent = (error: unknown) => {
  if (KNOWN.has(String((error as { _tag?: unknown })._tag))) return refused(error)
  toast.error("Niet verstuurd", { description: "Je bericht staat er nog. Probeer het zo nog eens." })
}

/** The list as the command will leave it, until the server's comes back. */
export type Overlay = (threads: Array<InboxThread>) => Array<InboxThread>

const patched = (id: string, patch: Partial<InboxThread>): Overlay => (threads) =>
  threads.map((t) => (t.id === id ? { ...t, ...patch } : t))

const ASIDE: Record<"archive" | "spam" | "snooze" | "trash", Place> = {
  archive: "archive",
  spam: "spam",
  snooze: "snoozed",
  trash: "trash"
}

const HOUR = 60 * 60 * 1000

const keys = { reactivityKeys: [...INBOX] }
const withTickets = { reactivityKeys: [...INBOX, ...TICKETS] }

/** Every inbox command, as the screen calls them; `show` lays a change over the list, `reset` takes them all off. */
export function useInboxWrites(
  show: (overlay: Overlay) => void,
  reset: () => void,
  openTicket: (id: string) => void,
  labels: ReadonlyArray<string>
): InboxWrites {
  const write = {
    markRead: useAtomSet(inboxWrites.markRead, { mode: "promiseExit" }),
    star: useAtomSet(inboxWrites.star, { mode: "promiseExit" }),
    label: useAtomSet(inboxWrites.label, { mode: "promiseExit" }),
    archive: useAtomSet(inboxWrites.archive, { mode: "promiseExit" }),
    spam: useAtomSet(inboxWrites.spam, { mode: "promiseExit" }),
    trash: useAtomSet(inboxWrites.trash, { mode: "promiseExit" }),
    snooze: useAtomSet(inboxWrites.snooze, { mode: "promiseExit" }),
    putBack: useAtomSet(inboxWrites.putBack, { mode: "promiseExit" }),
    assign: useAtomSet(inboxWrites.assign, { mode: "promiseExit" }),
    unassign: useAtomSet(inboxWrites.unassign, { mode: "promiseExit" }),
    linkTicket: useAtomSet(inboxWrites.linkTicket, { mode: "promiseExit" }),
    reply: useAtomSet(inboxWrites.reply, { mode: "promiseExit" }),
    forward: useAtomSet(inboxWrites.forward, { mode: "promiseExit" }),
    compose: useAtomSet(inboxWrites.compose, { mode: "promiseExit" }),
    undo: useAtomSet(inboxWrites.undo, { mode: "promiseExit" })
  }
  const undo = (token: string) =>
    void write.undo({ payload: { token }, ...withTickets }).then((exit) => {
      if (Exit.isFailure(exit)) refused(failureOf(exit))
    })
  /** Says what the change did, with its undo; a refusal puts the list back and says why. */
  const said = (exit: Exit.Exit<ThreadChange, unknown>, s: Said | undefined) => {
    if (Exit.isFailure(exit)) {
      reset()
      return refused(failureOf(exit))
    }
    const { undo: ticket, threads } = exit.value
    if (s === undefined || threads.length === 0) return
    if (ticket === null) return void toast.success(s.label, { description: s.detail })
    undoable(s.label, () => undo(ticket.token), s.detail)
  }
  const quiet = (exit: Exit.Exit<ThreadChange, unknown>) => said(exit, undefined)

  return {
    markRead: async (t, read) => {
      show(patched(t.id, { unread: !read }))
      quiet(await write.markRead({ payload: { ids: [t.id], read }, ...keys }))
    },
    star: async (t, starred) => {
      show(patched(t.id, { starred }))
      quiet(await write.star({ payload: { id: t.id, starred }, ...keys }))
    },
    assign: async (t, memberId, s) => {
      show(patched(t.id, { assignee: memberId }))
      said(
        await (memberId === undefined
          ? write.unassign({ payload: { id: t.id }, ...keys })
          : write.assign({ payload: { id: t.id, memberId }, ...keys })),
        s
      )
    },
    setAside: async (t, as, s) => {
      show(patched(t.id, { place: ASIDE[as] }))
      const ids = [t.id]
      said(
        await (as === "archive"
          ? write.archive({ payload: { ids }, ...keys })
          : as === "spam"
          ? write.spam({ payload: { ids }, ...keys })
          : as === "trash"
          ? write.trash({ payload: { ids }, ...keys })
          : write.snooze({ payload: { ids, until: Date.now() + HOUR }, ...keys })),
        s
      )
    },
    putBack: async (t, s) => {
      show(patched(t.id, { place: "inbox" }))
      said(await write.putBack({ payload: { ids: [t.id] }, ...keys }), s)
    },
    trash: true,
    label: {
      offered: labels,
      set: async (t, label, on) => {
        show(patched(t.id, { labels: on ? [...t.labels, label] : t.labels.filter((l) => l !== label) }))
        quiet(await write.label({ payload: { id: t.id, label, on }, ...keys }))
      }
    },
    linkTicket: async (t) => {
      const exit = await write.linkTicket({ payload: { threadId: t.id }, ...withTickets })
      if (Exit.isFailure(exit)) return refused(failureOf(exit))
      const { ticketId, ticketNumber, created } = exit.value
      toast.success(
        created ? `Ticket #${ticketNumber} aangemaakt vanuit deze mail` : `Gekoppeld aan ticket #${ticketNumber}`,
        { action: { label: "Openen", onClick: () => openTicket(ticketId) } }
      )
    },
    reply: async (t, body, s) => {
      const exit = await write.reply({ payload: { threadId: t.id, body }, ...keys })
      if (Exit.isFailure(exit)) {
        unsent(failureOf(exit))
        return false
      }
      const token = exit.value.undo.token
      undoable(s.label, () => undo(token), s.detail)
      return true
    },
    forward: async (t, to, note, s) => {
      const exit = await write.forward({
        payload: { threadId: t.id, to, ...(note === "" ? {} : { note }) },
        ...keys
      })
      if (Exit.isFailure(exit)) {
        unsent(failureOf(exit))
        return false
      }
      const token = exit.value.undo.token
      undoable(s.label, () => undo(token), s.detail)
      return true
    },
    compose: async ({ to, subject, body, mailbox }, s) => {
      const exit = await write.compose({
        payload: { to, subject, body, ...(mailbox === undefined ? {} : { mailboxId: mailbox }) },
        ...keys
      })
      if (Exit.isFailure(exit)) {
        unsent(failureOf(exit))
        return undefined
      }
      const token = exit.value.undo.token
      undoable(s.label, () => undo(token), s.detail)
      return exit.value.thread.id
    }
  }
}

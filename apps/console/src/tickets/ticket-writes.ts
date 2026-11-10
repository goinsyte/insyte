import { useAtomSet } from "@effect/atom-react"
import type { TicketChange } from "@insyte/modules/tickets/domain/Tickets"
import type { Ticket } from "@insyte/ui/app/lib/types/domain"
import { undoable } from "@insyte/ui/app/lib/undo"
import type { BulkChange, Said, TicketCommands, TicketPatch } from "@insyte/ui/app/tickets/source"
import { Exit } from "effect"
import { toast } from "sonner"
import { TICKETS, ticketWrites } from "../data/tickets.ts"
import { failureOf, type RefusalCopy, sayRefusal } from "../frame/refusals.ts"

/*
 * The ticket commands in the console (M11 step 3): each the server's, refreshing what names `TICKETS`, with "Ongedaan
 * maken" spending the command's undo token, also where the design's toast had none (a card dragged to another column,
 * a priority picked). The board and the modal show a change at once; a refused one puts the tickets back as the
 * server has them and says why.
 */

const COPY: RefusalCopy = {
  gone: "Dat ticket bestaat niet meer",
  invalid: {
    title: "Een titel is verplicht.",
    until: "Kies een moment in de toekomst.",
    required: "Een titel is verplicht."
  },
  other: (tagged) => {
    if (tagged._tag !== "MemberNotActive") return false
    toast.error("Die collega zit niet meer in het team", { description: "Kies iemand anders." })
    return true
  }
}

const refused = (error: unknown) => sayRefusal(error, COPY)

/** A ticket list changed as the command will change it, until the server's comes back. */
export type Overlay = (tickets: Array<Ticket>) => Array<Ticket>

const ms = (iso: string | undefined) => (iso === undefined ? null : Date.parse(iso))
const ASIDE = ["archived_at", "spam_at", "deleted_at", "snoozed_until"] as const

const patched = (ids: ReadonlyArray<string>, patch: (t: Ticket) => Ticket): Overlay => (tickets) =>
  tickets.map((t) => (ids.includes(t.id) ? patch(t) : t))

const changeOf = (change: BulkChange) => (t: Ticket): Ticket => {
  if ("status" in change) return { ...t, status: change.status }
  if ("priority" in change) return { ...t, priority: change.priority }
  const {
    archived_at: _archived,
    spam_at: _spam,
    deleted_at: _deleted,
    snoozed_until: _snoozed,
    ...kept
  } = t
  if ("putBack" in change) return kept
  const now = new Date().toISOString()
  switch (change.aside) {
    case "archived":
      return { ...t, archived_at: now }
    case "spam":
      return { ...t, spam_at: now }
    case "trash":
      return { ...t, deleted_at: now }
    case "snoozed":
      return { ...t, snoozed_until: new Date(Date.now() + 86_400_000).toISOString() }
  }
}

/** Every ticket command, as the screens call them; `show` lays a change over the list, `reset` takes them all off. */
export function useTicketCommands(show: (overlay: Overlay) => void, reset: () => void): TicketCommands {
  const keys = { reactivityKeys: [...TICKETS] }
  const write = {
    create: useAtomSet(ticketWrites.create, { mode: "promiseExit" }),
    duplicate: useAtomSet(ticketWrites.duplicate, { mode: "promiseExit" }),
    update: useAtomSet(ticketWrites.update, { mode: "promiseExit" }),
    setStatus: useAtomSet(ticketWrites.setStatus, { mode: "promiseExit" }),
    assign: useAtomSet(ticketWrites.assign, { mode: "promiseExit" }),
    unassign: useAtomSet(ticketWrites.unassign, { mode: "promiseExit" }),
    archive: useAtomSet(ticketWrites.archive, { mode: "promiseExit" }),
    spam: useAtomSet(ticketWrites.spam, { mode: "promiseExit" }),
    trash: useAtomSet(ticketWrites.trash, { mode: "promiseExit" }),
    snooze: useAtomSet(ticketWrites.snooze, { mode: "promiseExit" }),
    putBack: useAtomSet(ticketWrites.putBack, { mode: "promiseExit" }),
    reorder: useAtomSet(ticketWrites.reorder, { mode: "promiseExit" }),
    watch: useAtomSet(ticketWrites.watch, { mode: "promiseExit" }),
    unwatch: useAtomSet(ticketWrites.unwatch, { mode: "promiseExit" }),
    comment: useAtomSet(ticketWrites.comment, { mode: "promiseExit" }),
    undo: useAtomSet(ticketWrites.undo, { mode: "promiseExit" })
  }
  const undo = (token: string) =>
    void write.undo({ payload: { token }, ...keys }).then((exit) => {
      if (Exit.isFailure(exit)) refused(failureOf(exit))
    })
  /** Says what the change did, with its undo; a refusal puts the list back and says why. */
  const said = (exit: Exit.Exit<TicketChange, unknown>, s: Said | undefined) => {
    if (Exit.isFailure(exit)) {
      reset()
      return refused(failureOf(exit))
    }
    const { undo: ticket, tickets } = exit.value
    if (s === undefined || tickets.length === 0) return
    if (ticket === null) return void toast.success(s.label, { description: s.detail })
    undoable(s.label, () => undo(ticket.token), s.detail)
  }

  /** One ticket's change, by the command that makes it. */
  const editOf = (t: Ticket, patch: TicketPatch) => {
    const ids = [t.id]
    if (patch.status !== undefined) return write.setStatus({ payload: { ids, status: patch.status }, ...keys })
    if (patch.assignee_ids !== undefined) {
      const added = patch.assignee_ids.find((id) => !t.assignee_ids.includes(id))
      const removed = t.assignee_ids.find((id) => !patch.assignee_ids?.includes(id))
      if (added !== undefined) return write.assign({ payload: { id: t.id, memberId: added }, ...keys })
      if (removed !== undefined) return write.unassign({ payload: { id: t.id, memberId: removed }, ...keys })
      return undefined
    }
    if (patch.archived_at !== undefined) return write.archive({ payload: { ids }, ...keys })
    if (patch.spam_at !== undefined) return write.spam({ payload: { ids }, ...keys })
    if (patch.deleted_at !== undefined) return write.trash({ payload: { ids }, ...keys })
    if (patch.snoozed_until !== undefined) {
      return write.snooze({ payload: { ids, until: Date.parse(patch.snoozed_until) }, ...keys })
    }
    if (ASIDE.some((field) => field in patch)) return write.putBack({ payload: { ids }, ...keys })
    return write.update({
      payload: {
        ids,
        ...(patch.title === undefined ? {} : { title: patch.title }),
        ...(patch.description === undefined ? {} : { description: patch.description }),
        ...(patch.priority === undefined ? {} : { priority: patch.priority }),
        ...("due_at" in patch ? { dueAt: ms(patch.due_at) } : {}),
        ...(patch.tags === undefined ? {} : { labels: patch.tags })
      },
      ...keys
    })
  }

  const bulkOf = (ids: Array<string>, change: BulkChange) => {
    if ("status" in change) return write.setStatus({ payload: { ids, status: change.status }, ...keys })
    if ("priority" in change) return write.update({ payload: { ids, priority: change.priority }, ...keys })
    if ("putBack" in change) return write.putBack({ payload: { ids }, ...keys })
    switch (change.aside) {
      case "archived":
        return write.archive({ payload: { ids }, ...keys })
      case "spam":
        return write.spam({ payload: { ids }, ...keys })
      case "trash":
        return write.trash({ payload: { ids }, ...keys })
      case "snoozed":
        return write.snooze({ payload: { ids, until: Date.now() + 86_400_000 }, ...keys })
    }
  }

  return {
    create: async (input, s) => {
      const exit = await write.create({
        payload: {
          title: input.title,
          description: input.description,
          status: input.status,
          priority: input.priority,
          assigneeIds: input.assignee_ids,
          labels: input.tags,
          ...(input.due_at === undefined ? {} : { dueAt: Date.parse(input.due_at) }),
          ...(input.template === undefined ? {} : { template: input.template })
        },
        ...keys
      })
      said(exit, s)
    },
    edit: async (t, patch, s) => {
      show(patched([t.id], (x) => ({ ...x, ...patch })))
      const pending = editOf(t, patch)
      if (pending !== undefined) said(await pending, s)
    },
    bulk: async (rows, change, s) => {
      const ids = rows.map((t) => t.id)
      show(patched(ids, changeOf(change)))
      said(await bulkOf(ids, change), s)
    },
    reorder: async (status, ids) => {
      // As the design's board keeps it: the column's cards last, in their new order.
      show((tickets) => {
        const others = tickets.filter((t) => t.status !== status)
        const moved = ids.map((id) => tickets.find((t) => t.id === id)).filter((t): t is Ticket => t !== undefined)
        return [...others, ...moved]
      })
      const exit = await write.reorder({ payload: { ids: [...ids] }, ...keys })
      if (Exit.isFailure(exit)) {
        reset()
        refused(failureOf(exit))
      }
    },
    watch: async (t, on) => {
      const exit = await (on ? write.watch : write.unwatch)({ payload: { id: t.id }, ...keys })
      if (Exit.isFailure(exit)) refused(failureOf(exit))
    },
    duplicate: async (t) => {
      const exit = await write.duplicate({ payload: { id: t.id }, ...keys })
      if (Exit.isFailure(exit)) return refused(failureOf(exit))
      const copy = exit.value.tickets[0]
      const ticket = exit.value.undo
      if (copy === undefined || ticket === null) return
      undoable(`Gedupliceerd als #${copy.number}`, () => undo(ticket.token))
    },
    comment: async (t, body, mentions) => {
      const exit = await write.comment({
        payload: { id: t.id, body, mentions: mentions.map((p) => p.id) },
        ...keys
      })
      if (Exit.isFailure(exit)) refused(failureOf(exit))
    }
  }
}

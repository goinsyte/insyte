import { Forbidden, NotFound, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { MailboxView, ThreadDetail, ThreadList } from "@insyte/modules/inbox/domain/Inbox"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * The inbox (M11 step 2): every thread the role may see, set aside or not, primed by the route's loader, which the
 * screen sorts into folders as the server does; the workspace's mailboxes; one thread with its messages for the letter;
 * the panel's counts. Every inbox command names `INBOX`, and a `records.changed` for a thread or a mailbox refetches it.
 */

export const INBOX = ["inbox"] as const

/** As many as the list draws; the oldest beyond it are not offered yet. */
const LIMIT = 500

const errors = Schema.Union([Forbidden, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])

export const threadsAtom = Atom.serializable(
  ConsoleClient.query("Threads.list", { limit: LIMIT }, { reactivityKeys: INBOX }),
  { key: "threads", schema: AsyncResult.Schema({ success: ThreadList, error: errors }), skipInitialRun: true }
)

export const mailboxesAtom = Atom.serializable(
  ConsoleClient.query("Mailboxes.list", undefined, { reactivityKeys: INBOX }),
  {
    key: "mailboxes",
    schema: AsyncResult.Schema({ success: Schema.Array(MailboxView), error: errors }),
    skipInitialRun: true
  }
)

export const threadAtom = Atom.family((id: string) =>
  Atom.serializable(
    ConsoleClient.query("Threads.get", { id }, { reactivityKeys: INBOX }),
    {
      key: `thread:${id}`,
      schema: AsyncResult.Schema({ success: ThreadDetail, error: Schema.Union([NotFound, errors]) }),
      skipInitialRun: true
    }
  )
)

/** The area panel's counts, per folder and per mailbox, on the inbox page (ADR-0028). */
export const inboxCountsAtom = ConsoleClient.query("Nav.counts", { area: "inbox" }, { reactivityKeys: INBOX })

export const inboxWrites = {
  markRead: ConsoleClient.mutation("Threads.markRead"),
  star: ConsoleClient.mutation("Threads.star"),
  label: ConsoleClient.mutation("Threads.label"),
  archive: ConsoleClient.mutation("Threads.archive"),
  spam: ConsoleClient.mutation("Threads.spam"),
  trash: ConsoleClient.mutation("Threads.trash"),
  snooze: ConsoleClient.mutation("Threads.snooze"),
  putBack: ConsoleClient.mutation("Threads.putBack"),
  assign: ConsoleClient.mutation("Threads.assign"),
  unassign: ConsoleClient.mutation("Threads.unassign"),
  linkTicket: ConsoleClient.mutation("Threads.linkTicket"),
  reply: ConsoleClient.mutation("Threads.reply"),
  forward: ConsoleClient.mutation("Threads.forward"),
  compose: ConsoleClient.mutation("Threads.compose"),
  connect: ConsoleClient.mutation("Mailboxes.connect"),
  undo: ConsoleClient.mutation("Shared.undo")
} as const

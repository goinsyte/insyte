import { useAtomSet } from "@effect/atom-react"
import type { MessageChange } from "@insyte/modules/chats/domain/Chats"
import type { ChatWrites } from "@insyte/ui/app/chats/source"
import { undoable } from "@insyte/ui/app/lib/undo"
import { useNavigate } from "@tanstack/react-router"
import { Exit } from "effect"
import { toast } from "sonner"
import { chatKey, CHATS, chatWrites } from "../data/chats.ts"
import { TICKETS } from "../data/tickets.ts"
import { failureOf, type RefusalCopy, sayRefusal } from "../frame/refusals.ts"
import { ticketOf } from "../tickets/ticket-of.ts"
import { argSent } from "./chat-of.tsx"

/*
 * What the chats screen does in the console (M11 step 4): every write the server's `Chats.*`, refreshing the list and
 * the conversation it touched. A command's card keeps its "Ongedaan maken" in this tab only, as the token is this
 * tab's; a message taken back and a new channel get the design's toast with its undo. A refusal is said once, in Dutch.
 */

/** Why the server would not run a command, as the card would have said it. */
const REFUSED: Record<string, string> = {
  unavailable: "Dat kan hier nog niet",
  wrong_kind: "Die opdracht werkt niet op dit record",
  target_required: "Kies eerst een record met #",
  note_required: "Schrijf de notitie na de bestelling",
  unknown_member: "Noem de collega, bijvoorbeeld @Sofía",
  unknown_status: "Zeg bezig, wacht of klaar",
  decided: "Iemand anders heeft deze kaart al afgehandeld"
}

const COPY: RefusalCopy = {
  gone: "Dat bericht bestaat niet meer",
  invalid: { name: "Geef het kanaal een naam.", required: "Geef het kanaal een naam." },
  other: (tagged) => {
    switch (tagged._tag) {
      case "NotAMember":
        return void toast.error("Je zit niet in dit gesprek"), true
      case "EmptyMessage":
        return void toast.error("Schrijf eerst een bericht"), true
      case "NameTaken":
        return void toast.error(`#${String(tagged["name"])} bestaat al`), true
      case "CommandRefused":
        return void toast.error(REFUSED[String(tagged["reason"])] ?? "Dat lukte niet"), true
      default:
        return false
    }
  }
}

const refused = (error: unknown) => sayRefusal(error, COPY)

/** The reads a write to a conversation refreshes: the list and that conversation. */
const keys = (conversationId: string) => ({ reactivityKeys: [...CHATS, chatKey(conversationId)] })

/** Says a refusal; true when the write went through. */
function ok<A>(exit: Exit.Exit<A, unknown>): exit is Exit.Success<A, unknown> {
  if (Exit.isSuccess(exit)) return true
  refused(failureOf(exit))
  return false
}

/** A command card's undo, by its action: what "Ongedaan maken" spends, for as long as this tab is open. */
const UNDO = new Map<string, string>()

const keep = (change: MessageChange) => {
  const action = change.message.action
  if (action !== null && change.undo !== null) UNDO.set(action.id, change.undo.token)
}

export function useChatWrites(
  { team, setDraft, typed }: {
    team: ReadonlyArray<{ id: string; name: string }>
    setDraft: (key: string, value: string) => void
    /** The person typed in a conversation's composer. */
    typed: (conversationId: string) => void
  }
): ChatWrites {
  const navigate = useNavigate()
  const write = {
    send: useAtomSet(chatWrites.send, { mode: "promiseExit" }),
    edit: useAtomSet(chatWrites.edit, { mode: "promiseExit" }),
    remove: useAtomSet(chatWrites.remove, { mode: "promiseExit" }),
    react: useAtomSet(chatWrites.react, { mode: "promiseExit" }),
    pinMessage: useAtomSet(chatWrites.pinMessage, { mode: "promiseExit" }),
    pin: useAtomSet(chatWrites.pin, { mode: "promiseExit" }),
    mute: useAtomSet(chatWrites.mute, { mode: "promiseExit" }),
    markRead: useAtomSet(chatWrites.markRead, { mode: "promiseExit" }),
    createChannel: useAtomSet(chatWrites.createChannel, { mode: "promiseExit" }),
    openDm: useAtomSet(chatWrites.openDm, { mode: "promiseExit" }),
    runCommand: useAtomSet(chatWrites.runCommand, { mode: "promiseExit" }),
    confirm: useAtomSet(chatWrites.confirm, { mode: "promiseExit" }),
    decline: useAtomSet(chatWrites.decline, { mode: "promiseExit" }),
    createTicket: useAtomSet(chatWrites.createTicket, { mode: "promiseExit" }),
    undo: useAtomSet(chatWrites.undo, { mode: "promiseExit" })
  }
  const undo = async (token: string, conversationId: string) => {
    const exit = await write.undo({ payload: { token }, ...keys(conversationId) })
    return ok(exit)
  }

  return {
    send: (c, out) =>
      void write.send({
        payload: {
          conversationId: c.id,
          body: out.body,
          ...(out.mentions.length === 0 ? {} : { mentions: out.mentions.map((p) => p.id) }),
          ...(out.records.length === 0 ? {} : { records: out.records.map((r) => ({ kind: r.kind, id: r.id })) }),
          ...(out.parent === null ? {} : { replyTo: out.parent.id }),
          ...(out.alsoToChannel ? { alsoToChannel: true } : {})
        },
        ...keys(c.id)
      }).then(ok),
    run: (c, run) => {
      const arg = argSent(run.command, run.arg, team)
      void write.runCommand({
        payload: {
          conversationId: c.id,
          command: run.command,
          ...(run.target === undefined ? {} : { target: { kind: run.target.kind, id: run.target.id } }),
          ...(arg === undefined ? {} : { arg }),
          ...(run.parent === null ? {} : { replyTo: run.parent.id })
        },
        ...keys(c.id)
      }).then((exit) => {
        if (ok(exit)) keep(exit.value)
      })
    },
    confirm: async (a) => {
      const exit = await write.confirm({ payload: { actionId: a.id }, reactivityKeys: [...CHATS] })
      if (Exit.isFailure(exit)) {
        const error = failureOf(exit) as { _tag?: string; reason?: string }
        if (error._tag === "CommandRefused") return REFUSED[error.reason ?? ""] ?? "Dat lukte niet"
        refused(error)
        return undefined
      }
      keep(exit.value)
      const action = exit.value.message.action
      return action?.state === "failed" ? (action.error ?? "Er ging iets mis. Probeer het opnieuw.") : undefined
    },
    decline: (a) => void write.decline({ payload: { actionId: a.id }, reactivityKeys: [...CHATS] }).then(ok),
    canUndo: (a) => UNDO.has(a.id),
    undo: async (a) => {
      const token = UNDO.get(a.id)
      if (token === undefined) return false
      const exit = await write.undo({ payload: { token }, reactivityKeys: [...CHATS] })
      UNDO.delete(a.id)
      return ok(exit)
    },
    react: (m, emoji) => {
      const mine = m.reactions?.find((r) => r.emoji === emoji)?.mine === true
      void write.react({ payload: { messageId: m.id, emoji, on: !mine }, ...keys(m.conversation_id) }).then(ok)
    },
    edit: (m, body) => void write.edit({ payload: { messageId: m.id, body }, ...keys(m.conversation_id) }).then(ok),
    remove: async (m) => {
      const exit = await write.remove({ payload: { messageId: m.id }, ...keys(m.conversation_id) })
      if (!ok(exit)) return
      const ticket = exit.value.undo
      if (ticket === null) return void toast("Bericht verwijderd")
      undoable("Bericht verwijderd", () => void undo(ticket.token, m.conversation_id))
    },
    pinMessage: (m) =>
      void write.pinMessage({ payload: { messageId: m.id, pinned: !m.pinned }, ...keys(m.conversation_id) }).then(ok),
    pin: (c, pinned) => void write.pin({ payload: { conversationId: c.id, pinned }, ...keys(c.id) }).then(ok),
    mute: (c, muted) => void write.mute({ payload: { conversationId: c.id, muted }, ...keys(c.id) }).then(ok),
    createChannel: async (name, topic) => {
      const exit = await write.createChannel({
        payload: { name, ...(topic.trim() === "" ? {} : { topic }) },
        reactivityKeys: [...CHATS]
      })
      if (!ok(exit)) return
      const { conversation, undo: ticket } = exit.value
      void navigate({ to: "/chats", search: { id: conversation.id } } as never)
      if (ticket === null) return
      undoable(`#${conversation.name} aangemaakt`, () => void undo(ticket.token, conversation.id))
    },
    ticketFrom: async (m, c) => {
      const related = m.records?.find((r) => r.kind === "order" || r.kind === "customer")
      const exit = await write.createTicket({
        payload: {
          title: m.body.replace(/[*_`~]/g, "").slice(0, 80) || "Uit de teamchat",
          description: `${m.sender_name} in #${c.name}: ${m.body}`,
          priority: "medium",
          ...(related === undefined ? {} : { related: { type: related.kind as "order" | "customer", id: related.id } })
        },
        reactivityKeys: [...TICKETS]
      })
      if (!ok(exit)) return
      const row = exit.value.tickets[0]
      if (row === undefined) return
      const t = ticketOf(row)
      toast(`Ticket ${t.number} aangemaakt`, {
        action: { label: "Openen", onClick: () => void navigate({ to: "/tickets", search: { ticket: t.id } as never }) }
      })
    },
    openDirect: async (id) => {
      const exit = await write.openDm({
        payload: { memberId: id.slice("conv_dm_".length) },
        reactivityKeys: [...CHATS]
      })
      if (!ok(exit)) return
      void navigate({ to: "/chats", search: { id: exit.value.id }, replace: true } as never)
    },
    markRead: (c) => {
      if (c.unread_count > 0) void write.markRead({ payload: { conversationId: c.id }, reactivityKeys: [...CHATS] })
    },
    setDraft: (key, value) => {
      setDraft(key, value)
      if (value.trim() !== "" && !key.includes(":")) typed(key)
    }
  }
}

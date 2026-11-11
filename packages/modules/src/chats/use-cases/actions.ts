import { Db } from "@insyte/database/Db"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import * as Undo from "../../shared/use-cases/Undo.ts"
import {
  type ChatsRestore,
  type CommandId,
  CommandRefused,
  CONFIRMED,
  MessageChange,
  type RecordRef,
  type RunCommandInput
} from "../domain/Chats.ts"
import { ChatCommands } from "../domain/Ports.ts"
import { conversationOf, messageIn, messageRow } from "./chats.ts"
import { announce, post, RESTORE } from "./commands.ts"

/*
 * Commands in a conversation (M11 step 4; domain.md §7.1, widgets/04 §C "Chat action card"): `/notitie`, `/ticket`,
 * `/toewijzen`, `/status` and `/annuleren`, from the composer or a verb in the record column. Each posts its card in the
 * conversation. A reversible one runs at once as the person, through the use case its slice owns (`ChatCommands`), and
 * its undo is the card's ("Ongedaan maken"). A money or irreversible one (`/annuleren`; `/terugbetalen`, `/bewijs` and
 * `/accepteren` once M13 has them) waits in `confirm` and runs only on `Chats.confirmAction`, with no undo. What has no
 * use case yet is refused as unavailable, never pretended.
 */

/** The record kind each command acts on; `ticket` takes any record, or none. */
const TARGET: Partial<Record<CommandId, ReadonlyArray<RecordRef["kind"]>>> = {
  note: ["order"],
  cancel: ["order"],
  refund: ["order"],
  assign: ["ticket"],
  status: ["ticket"],
  evidence: ["chargeback"],
  accept: ["chargeback"]
}

const STATUSES = new Set(["intake", "in_progress", "awaiting_reply", "done"])

const check = (input: typeof RunCommandInput.Type, available: ReadonlySet<CommandId>) => {
  if (!available.has(input.command)) return new CommandRefused({ reason: "unavailable" })
  const kinds = TARGET[input.command]
  if (kinds !== undefined) {
    if (input.target === undefined) return new CommandRefused({ reason: "target_required" })
    if (!kinds.includes(input.target.kind)) return new CommandRefused({ reason: "wrong_kind" })
  }
  const arg = input.arg?.trim() ?? ""
  if (input.command === "note" && arg === "") return new CommandRefused({ reason: "note_required" })
  if (input.command === "assign" && arg === "") return new CommandRefused({ reason: "unknown_member" })
  if (input.command === "status" && !STATUSES.has(arg)) return new CommandRefused({ reason: "unknown_status" })
  return undefined
}

/** Runs the card's command as the principal and records how it went; answers the card's undo, where it has one. */
const execute = Effect.fn("Chats.execute")(function*(actionId: string) {
  const commands = yield* ChatCommands
  const db = yield* Db
  const [a] = yield* db.scoped((sql) =>
    sql<{
      command: CommandId
      targetKind: RecordRef["kind"] | null
      targetId: string | null
      arg: string | null
      messageId: string
    }>`select command, target_kind, target_id, arg, message_id from chat_actions where id = ${actionId}`
  )
  const ran = yield* commands.run({
    command: a!.command,
    target: a!.targetKind === null || a!.targetId === null ? null : { kind: a!.targetKind, id: a!.targetId },
    arg: a!.arg,
    messageId: a!.messageId
  }).pipe(Effect.result)
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const m = yield* messageIn(sql, a!.messageId)
      let undo = null
      if (ran._tag === "Failure") {
        yield* sql`update chat_actions set state = 'failed', error = ${ran.failure.message} where id = ${actionId}`
      } else {
        const inner = ran.success.undo
        if (inner !== null) {
          undo = yield* Undo.issue(sql, {
            command: RESTORE,
            compensation: {
              kind: "action",
              id: actionId,
              innerHash: yield* Undo.hashOf(inner.token)
            } satisfies ChatsRestore
          })
        }
        yield* sql`update chat_actions set state = 'done', error = null,
                     undo_until = ${undo === null ? null : new Date(Math.min(undo.until, inner!.until))}
                   where id = ${actionId}`
        // What the command made (a ticket) is shared on the card's message, so it shows as a live record card.
        const made = ran.success.made
        if (made !== undefined) {
          yield* sql`update messages set records = ${JSON.stringify([made])}::jsonb where id = ${m.id}`
        }
      }
      yield* announce(sql, m.conversation, m.id, true)
      return new MessageChange({ message: yield* messageRow(sql, m.id), undo })
    })
  )
})

/**
 * `Chats.runCommand`: the card posted as the person's message; a reversible command run at once, a money or
 * irreversible one left to confirm.
 */
export const runCommand = Effect.fn("Chats.runCommand")(function*(input: typeof RunCommandInput.Type) {
  yield* Policy.require("support", 1)
  const commands = yield* ChatCommands
  const refused = check(input, commands.available)
  if (refused !== undefined) return yield* refused
  const p = yield* CurrentPrincipal
  const db = yield* Db
  const confirm = CONFIRMED.has(input.command)
  const { actionId, change } = yield* db.scoped((sql: SqlClient.SqlClient) =>
    Effect.gen(function*() {
      const c = yield* conversationOf(sql, input.conversationId)
      let replyTo: string | null = null
      if (input.replyTo !== undefined) {
        const parent = yield* messageIn(sql, input.replyTo)
        replyTo = parent.replyTo ?? parent.id
      }
      const messageId = yield* post(sql, c, {
        body: "",
        mentions: [],
        records: [],
        replyTo,
        alsoInChannel: false
      })
      const actionId = mintId("cha")
      yield* sql`
        insert into chat_actions (id, workspace_id, conversation_id, message_id, command, target_kind, target_id, arg,
                                  state, created_by)
        values (${actionId}, ${p.workspaceId}, ${c.id}, ${messageId}, ${input.command}, ${input.target?.kind ?? null},
                ${input.target?.id ?? null}, ${input.arg?.trim() || null}, ${confirm ? "confirm" : "running"},
                ${p.id})`
      return {
        actionId,
        change: confirm ? new MessageChange({ message: yield* messageRow(sql, messageId), undo: null }) : null
      }
    })
  )
  return change ?? (yield* execute(actionId))
})

const decidable = Effect.fn("Chats.decidable")(function*(sql: SqlClient.SqlClient, actionId: string) {
  const [a] = yield* sql<{ messageId: string; state: string }>`
    select message_id, state from chat_actions where id = ${actionId} for update`
  if (a === undefined) return yield* new CommandRefused({ reason: "decided" })
  // The conversation's own check: who may not read it may not decide its cards.
  yield* messageIn(sql, a.messageId)
  if (a.state !== "confirm" && a.state !== "proposed") return yield* new CommandRefused({ reason: "decided" })
  return a
})

/** `Chats.confirmAction`: the card's "{commando}" or "Goedkeuren"; the command runs as whoever confirmed it. */
export const confirmAction = Effect.fn("Chats.confirmAction")(function*(actionId: string) {
  yield* Policy.require("support", 1)
  const p = yield* CurrentPrincipal
  const db = yield* Db
  yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* decidable(sql, actionId)
      yield* sql`update chat_actions set state = 'running',
                   decided_by = case when created_by = ${p.id} then null else ${p.id} end
                 where id = ${actionId}`
    })
  )
  return yield* execute(actionId)
})

/** `Chats.declineAction`: "Annuleren" / "Afwijzen"; nothing runs. */
export const declineAction = Effect.fn("Chats.declineAction")(function*(actionId: string) {
  yield* Policy.require("support", 1)
  const p = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const a = yield* decidable(sql, actionId)
      yield* sql`update chat_actions set state = 'declined',
                   decided_by = case when created_by = ${p.id} then null else ${p.id} end
                 where id = ${actionId}`
      const m = yield* messageIn(sql, a.messageId)
      yield* announce(sql, m.conversation, m.id, true)
      return new MessageChange({ message: yield* messageRow(sql, m.id), undo: null })
    })
  )
})

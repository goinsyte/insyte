import { useAtomValue } from "@effect/atom-react"
import { Forbidden } from "@insyte/domain/Errors"
import type { ConversationRow } from "@insyte/modules/chats/domain/Chats"
import { type ChatRow, ChatsView, Quiet } from "@insyte/ui/app/dashboard/card-views"
import { WidgetBones } from "@insyte/ui/app/loading/page-skeletons"
import { Option, Schema } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useRef } from "react"
import { chatsAtom } from "../data/chats.ts"

/*
 * "Ongelezen chats" on Start (widgets/02 §chats): the member's conversations over `Chats.list`, the same read the chats
 * page and its panel use, so a `chat.message` frame moves it. Muted conversations stay off it; the five with the most
 * unread come first, then the most recent. The count above them is everything unread outside the muted ones, not only
 * the five shown.
 */

const SHOWN = 5

const isForbidden = Schema.is(Forbidden)

/** The rows the card shows and the unread it counts, from the conversations the member is in. */
function chatsCardOf(conversations: ReadonlyArray<ConversationRow>): { rows: Array<ChatRow>; unread: number } {
  const heard = conversations.filter((c) => !c.muted)
  const rows = heard
    .toSorted((a, b) => b.unread - a.unread || (b.lastMessageAt ?? b.createdAt) - (a.lastMessageAt ?? a.createdAt))
    .slice(0, SHOWN)
    .map((c) => ({ id: c.id, group: c.kind !== "dm", name: c.name, preview: c.preview, unread: c.unread }))
  return { rows, unread: heard.reduce((n, c) => n + c.unread, 0) }
}

export function ConsoleChats() {
  const result = useAtomValue(chatsAtom)
  const value = Option.getOrUndefined(AsyncResult.value(result))
  // A refresh keeps the last list on the card until the new one is in.
  const last = useRef(value)
  if (value !== undefined) last.current = value
  const list = value ?? last.current
  if (list !== undefined) {
    const { rows, unread } = chatsCardOf(list.conversations)
    return <ChatsView rows={rows} unread={unread} />
  }
  if (AsyncResult.isFailure(result)) {
    const forbidden = result.cause.reasons.some((r) => r._tag === "Fail" && isForbidden(r.error))
    return <Quiet>{forbidden ? "Je rol kan dit niet inzien." : "Je chats konden niet worden geladen."}</Quiet>
  }
  return <WidgetBones rows={3} />
}

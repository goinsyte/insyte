import { createContext, useContext } from "react"
import type { ChatCommandId, ChatRecordRef } from "../../data-source"
import type { Conversation } from "../lib/types/domain"
import type { ChatRecord } from "./records"
import type { Message } from "./source"

/** What a message, a card or the side column can ask of the conversation they sit in. */
export type ChatApi = {
  conversation: Conversation
  handles: ReadonlySet<string>
  /** The record open in the side column, so its card in the stream can show it is the one. */
  openRecordRef: ChatRecordRef | null
  openRecord: (ref: ChatRecordRef) => void
  openThread: (messageId: string) => void
  threadId: string | null
  /** Puts "@Name " in the composer and focuses it. */
  mention: (handle: string) => void
  /** Adds a record to the composer, ready to send. */
  attach: (ref: ChatRecordRef) => void
  toggleReaction: (message: Message, emoji: string) => void
  /** Runs a command on a record as the person at the keyboard, posting its card in the conversation. */
  act: (command: ChatCommandId, record: ChatRecord | null, arg?: string) => void
}

export const ChatContext = createContext<ChatApi | null>(null)

export function useChat(): ChatApi {
  const api = useContext(ChatContext)
  if (!api) throw new Error("useChat outside ChatContext")
  return api
}

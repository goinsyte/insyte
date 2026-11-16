import { Schema } from "effect"

/*
 * The website chat's words the inbox keeps beside the shared seam (`shared/domain/ChatChannel.ts`, M15 step 8): the
 * channels a thread can come in on, who wrote a message, and how long one may be.
 */

/** The chat channels a thread can come in on. The website chat only, for now. */
export const ChatChannelKind = Schema.Literals(["webchat"])
export type ChatChannelKind = typeof ChatChannelKind.Type

/** Who wrote a message: the shopper, a person of the team, the workspace's agent, or Insyte itself (a greeting). */
export const ChatAuthor = Schema.Literals(["shopper", "team", "agent", "system"])

/** The longest message either side may write. */
export const CHAT_TEXT_MAX = 1000

/** Control characters a message may not hold: all of them but the newline (a NUL among them, which Postgres refuses). */
// oxlint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0009\u000B-\u001F\u007F]/

/** Why a trimmed message is refused (`required`, `too_long`, `control`), or `undefined` when it may be stored. */
export const textRefused = (text: string): "required" | "too_long" | "control" | undefined =>
  text === "" ? "required" : text.length > CHAT_TEXT_MAX ? "too_long" : CONTROL.test(text) ? "control" : undefined

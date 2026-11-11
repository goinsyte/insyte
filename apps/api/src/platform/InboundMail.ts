import type { Address, InboundMail } from "@insyte/modules/inbox/domain/Inbox"
import PostalMime, { type Address as Parsed, type Attachment } from "postal-mime"

/*
 * A raw RFC 822 mail as the inbox stores it (M11 step 1): parsed with postal-mime, which runs in the Worker and reads
 * multipart bodies, encoded words and every common charset. Groups are flattened to their mailboxes; a body that is
 * HTML only gets a text version, for search and the row's line. Used by the `email()` handler and the dev route alike.
 */

const flat = (list: ReadonlyArray<Parsed> | undefined): Array<Address> =>
  (list ?? []).flatMap((a) =>
    a.group === undefined
      ? [{ name: a.name, email: a.address }]
      : a.group.map((m) => ({ name: m.name, email: m.address }))
  ).filter((a) => a.email.trim() !== "")

/** A rough text of an HTML body: its blocks as lines, its tags and entities gone. */
export const textOfHtml = (html: string) =>
  html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

const bytesOf = (content: Attachment["content"]): Uint8Array =>
  typeof content === "string"
    ? new TextEncoder().encode(content)
    : content instanceof Uint8Array
    ? content
    : new Uint8Array(content)

/** `<a@b> <c@d>` as its ids. */
const idsOf = (header: string | undefined) => header?.match(/<[^<>\s]+>/g) ?? []

export const parseMail = async (raw: string | ArrayBuffer | Uint8Array): Promise<InboundMail> => {
  const email = await PostalMime.parse(raw, { attachmentEncoding: "arraybuffer" })
  const from = email.from === undefined ? [] : flat([email.from])
  const date = email.date === undefined ? null : new Date(email.date)
  const html = email.html ?? null
  return {
    messageId: email.messageId ?? null,
    inReplyTo: idsOf(email.inReplyTo)[0] ?? null,
    references: idsOf(email.references),
    from: from[0] ?? { name: "", email: "onbekend@onbekend" },
    to: flat(email.to),
    cc: flat(email.cc),
    subject: (email.subject ?? "").trim(),
    text: (email.text ?? (html === null ? "" : textOfHtml(html))).trim().slice(0, 200_000),
    html,
    date: date === null || Number.isNaN(date.getTime()) ? null : date,
    attachments: email.attachments.map((a) => ({
      filename: a.filename ?? "bijlage",
      mime: a.mimeType || "application/octet-stream",
      bytes: bytesOf(a.content),
      inline: a.disposition === "inline" && a.contentId !== undefined,
      contentId: a.contentId ?? null
    }))
  }
}

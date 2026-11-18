import { expect } from "vitest"
import { ok, run } from "./journeys.ts"
import { call, rpc } from "./support.ts"

/*
 * Inbox records for the public API's tests: a mail thread, delivered down the `email()` handler's path to the
 * workspace's forwarding mailbox, and a website chat a shopper opens on a store's own storefront.
 */

let n = 0

/** The workspace's forwarding mailbox, connected the first time a test asks. */
const forwardingOf = async (cookie: string) => {
  const boxes = ok(await rpc("Mailboxes.list", undefined, cookie))
  const found = boxes.find((b) => b.provider === "forward")
  if (found !== undefined) return { id: found.id, address: found.forwardingAddress! }
  const box = ok(
    await rpc(
      "Mailboxes.connect",
      { provider: "forward", address: `support-${run}@winkel.test`, label: "Support" },
      cookie
    )
  )
  return { id: box.id, address: box.forwardingAddress! }
}

/** A shopper's mail, as a new thread in the workspace's inbox. */
export const mailThread = async (
  cookie: string,
  mail: { from?: string; name?: string; subject?: string; body?: string } = {}
) => {
  const box = await forwardingOf(cookie)
  const from = mail.from ?? `klant-${run}-${++n}@voorbeeld.nl`
  const raw = [
    `From: "${mail.name ?? "Sofie de Vries"}" <${from}>`,
    `To: Support <support-${run}@winkel.test>`,
    `Subject: ${mail.subject ?? "Waar is mijn pakket?"}`,
    `Message-ID: <mail-${run}-${++n}@voorbeeld.nl>`,
    "Content-Type: text/plain; charset=utf-8",
    "MIME-Version: 1.0",
    "",
    mail.body ?? "Hoi, mijn bestelling is nog niet binnen."
  ].join("\r\n")
  const response = await call("http://api.test/api/__dev/mail/inbound", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ to: box.address, raw })
  })
  expect(response.status).toBe(200)
  const body = await response.json() as { threadId: string }
  return { threadId: body.threadId, mailboxId: box.id, from }
}

const CHAT = "https://api.public.test/api/public/chat"

/** A store's chat, connected once; then a shopper's message from its storefront, as a chat in the inbox. */
export const webchatThread = async (store: { cookie: string; shop: string; storeId: string }, text: string) => {
  const channels = ok(await rpc("Channels.list", undefined, store.cookie)).channels
  if (!channels.some((c) => c.storeId === store.storeId)) {
    ok(await rpc("Channels.connect", { kind: "webchat", greeting: "Hoi!", storeId: store.storeId }, store.cookie))
  }
  const origin = `https://www.${store.shop.replace(".myshopify.com", "")}.test`
  const opened = await call(`${CHAT}/session`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ shop: store.shop })
  })
  expect(opened.status).toBe(200)
  const { token } = await opened.json() as { token: string }
  const posted = await call(`${CHAT}/${store.storeId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, authorization: `Bearer ${token}` },
    body: JSON.stringify({ text })
  })
  expect(posted.status).toBe(200)
  const rows = ok(await rpc("Threads.list", { channel: "webchat" }, store.cookie)).rows
  return rows.find((r) => r.storeId === store.storeId && r.preview.includes(text.slice(0, 20)))!.id
}

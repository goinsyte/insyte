import { receive } from "@insyte/modules/inbox/use-cases/inbound"
import { isReplyAddress, receiveReply } from "@insyte/modules/notifications/use-cases/replies"
import { BackgroundRuntime as background } from "../../platform/BackgroundLayer.ts"
import type { Env } from "../../platform/Env.ts"
import { parseMail } from "../../platform/InboundMail.ts"
import { Telemetry } from "../../platform/Observability.ts"
import { withRequestDb } from "../../platform/RequestDb.ts"

/**
 * A support mail at a forwarding address (M11 step 1), through Cloudflare Email Routing: into its mailbox's inbox; an
 * answer to a notification mail (`reply+<token>@`), a comment on its record (M11 step 13.5).
 * An address no mailbox has is refused, so the sender hears it bounced; a throw leaves it to Email Routing's retry.
 */
export const email: EmailExportedHandler<Env> = async (message, _env, ctx) => {
  // This mail's own exporter (`Observability.ts`).
  const spans = Telemetry.open()
  try {
    const mail = await parseMail(await new Response(message.raw).arrayBuffer())
    // An answer to a notification mail becomes a comment (M11 step 13.5); anything else there is dropped unanswered.
    if (isReplyAddress(message.to)) {
      await background.runPromise(spans.provide(withRequestDb(receiveReply(message.to, mail.from.email, mail.text))))
      return
    }
    const stored = await background.runPromise(spans.provide(withRequestDb(receive(message.to, mail))))
    if (stored === undefined) message.setReject("Onbekend adres")
  } finally {
    ctx.waitUntil(spans.flush())
  }
}

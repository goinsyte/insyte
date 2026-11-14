import { Db } from "@insyte/database/Db"
import { receive } from "@insyte/modules/inbox/use-cases/inbound"
import { isReplyAddress, receiveReply } from "@insyte/modules/notifications/use-cases/replies"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { AppInfo } from "../../../platform/Bindings.ts"
import { parseMail } from "../../../platform/InboundMail.ts"
import { busyReferences, capturedSenders, refusedReferences, refusedSenderDomains } from "../../../platform/Mail.ts"
import { withRequestDb } from "../../../platform/RequestDb.ts"
import { devOnly, notInProduction } from "./shared.ts"

/**
 * `GET /api/__dev/mail?to=<address>`: the mails the capture adapter "sent" to one address, newest first. For the
 * worker tests, the e2e journey and a person trying a preview. `&reference=<id>` keeps one record's (a return's shopper
 * mails, M9.3), since every test's recorded store mails the same shoppers. Refused in production, and behind Access
 * everywhere else.
 */
const CapturedMail = HttpRouter.add(
  "GET",
  "/api/__dev/mail",
  Effect.gen(function*() {
    const { environment } = yield* AppInfo
    if (environment === "production") {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const request = yield* HttpServerRequest.HttpServerRequest
    const query = new URL(request.url, "http://local").searchParams
    const to = query.get("to")?.toLowerCase() ?? ""
    const reference = query.get("reference")
    const db = yield* Db
    const mails = yield* db.routing((sql) =>
      sql<{
        kind: string
        url: string | null
        sender: string | null
        reference: string | null
        subject: string | null
        bodyText: string | null
        sentAt: Date
      }>`
        select kind, url, sender, reference, subject, body_text, sent_at from captured_mail
        where to_address = ${to} and (${reference}::text is null or reference = ${reference})
        order by sent_at desc, id desc limit 20`
    )
    // The sender each record's newest mail went with (E-mail en domein), which the table does not keep.
    return HttpServerResponse.jsonUnsafe({
      mails: mails.map((m) => ({ ...m, ...(m.reference === null ? {} : capturedSenders.get(m.reference)) }))
    })
  }).pipe(withRequestDb)
)

/**
 * `POST /api/__dev/mail/refuse?reference=<id>`: the capture adapter refuses one record's mails from now on (an order's
 * delay mail, M10.2), as a bouncing address would, so a mail that does not go can be tried; `&off=1` takes it back.
 * `&busy=1`: the provider is busy for them instead (Resend's 429), so a mail tried again later can be. Only where
 * nothing real lives (`devOnly`).
 */
const MailRefuse = HttpRouter.add(
  "POST",
  "/api/__dev/mail/refuse",
  Effect.gen(function*() {
    if (!(yield* devOnly)) return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    const request = yield* HttpServerRequest.HttpServerRequest
    const query = new URL(request.url, "http://local").searchParams
    const reference = query.get("reference") ?? ""
    const set = query.get("busy") === "1" ? busyReferences : refusedReferences
    if (reference !== "" && query.get("off") === "1") set.delete(reference)
    else if (reference !== "") set.add(reference)
    return HttpServerResponse.jsonUnsafe({ refused: [...refusedReferences], busy: [...busyReferences] })
  })
)

/**
 * `POST /api/__dev/mail/refuse-sender?domain=<name>`: the capture adapter refuses mail from that sending domain from now
 * on, as Resend does one that is not verified (any more), so the brand's mail falling back to Insyte's address can be
 * tried (E-mail en domein, M17 step 20.1c); `&off=1` takes it back. Refused in production.
 */
const MailRefuseSender = HttpRouter.add(
  "POST",
  "/api/__dev/mail/refuse-sender",
  Effect.gen(function*() {
    const { environment } = yield* AppInfo
    if (environment === "production") {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const request = yield* HttpServerRequest.HttpServerRequest
    const query = new URL(request.url, "http://local").searchParams
    const domain = (query.get("domain") ?? "").toLowerCase()
    if (domain !== "" && query.get("off") === "1") refusedSenderDomains.delete(domain)
    else if (domain !== "") refusedSenderDomains.add(domain)
    return HttpServerResponse.jsonUnsafe({ refused: [...refusedSenderDomains] })
  })
)

/**
 * `POST /api/__dev/mail/inbound` `{ to, raw }`: a raw RFC 822 mail delivered to a forwarding address, as Cloudflare Email
 * Routing hands it to the Worker's `email()` handler (M11 step 1), down the same path, an answer to a notification mail
 * included (`{ reply }`, M11 step 13.5). For the worker tests, the
 * journey and a person trying a preview, where no MX points at the Worker. Refused in production.
 */
const InboundMail = HttpRouter.add(
  "POST",
  "/api/__dev/mail/inbound",
  Effect.gen(function*() {
    if (!(yield* notInProduction)) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "not_found" } }, { status: 404 })
    }
    const request = yield* HttpServerRequest.HttpServerRequest
    const body = (yield* request.json.pipe(Effect.orDie)) as { readonly to?: unknown; readonly raw?: unknown }
    const { to, raw } = body
    if (typeof to !== "string" || typeof raw !== "string") {
      return HttpServerResponse.jsonUnsafe({ error: { code: "invalid" } }, { status: 400 })
    }
    const mail = yield* Effect.promise(() => parseMail(raw))
    if (isReplyAddress(to)) {
      return HttpServerResponse.jsonUnsafe({
        reply: yield* receiveReply(to, mail.from.email, mail.text).pipe(Effect.orDie)
      })
    }
    const stored = yield* receive(to, mail).pipe(Effect.orDie)
    if (stored === undefined) {
      return HttpServerResponse.jsonUnsafe({ error: { code: "unknown_address" } }, { status: 404 })
    }
    return HttpServerResponse.jsonUnsafe(stored)
  }).pipe(withRequestDb)
)

export const MailRoutes = Layer.mergeAll(CapturedMail, MailRefuse, MailRefuseSender, InboundMail)

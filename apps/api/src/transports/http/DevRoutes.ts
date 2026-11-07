import { Db } from "@insyte/database/Db"
import { Effect } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { AppInfo } from "../../platform/Bindings.ts"
import { withRequestDb } from "../../platform/RequestDb.ts"

/**
 * `GET /api/__dev/mail?to=<address>`: the mails the capture adapter "sent" to one address, newest first. For the
 * worker tests, the e2e journey and a person trying a preview. Refused in production, and behind Access everywhere
 * else.
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
    const to = new URL(request.url, "http://local").searchParams.get("to")?.toLowerCase() ?? ""
    const db = yield* Db
    const mails = yield* db.routing((sql) =>
      sql<{ kind: string; url: string | null; sentAt: Date }>`
        select kind, url, sent_at from captured_mail where to_address = ${to} order by sent_at desc, id desc limit 20`
    )
    return HttpServerResponse.jsonUnsafe({ mails })
  }).pipe(withRequestDb)
)

export const DevRoutes = CapturedMail

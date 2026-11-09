import { receive } from "@insyte/modules/forwarding/use-cases/work"
import { Effect } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import { withRequestDb } from "../../platform/RequestDb.ts"

/*
 * `POST /hooks/supplier/:id` (M8.3): a supplier's own API tells Insyte it accepted an order, has a problem with it,
 * shipped it, or what stock it has, on the API's public hostname, signed with the secret Insyte generated for it. The
 * raw bytes are verified before anything is parsed.
 */
export const SupplierHookRoutes = HttpRouter.add(
  "POST",
  "/hooks/supplier/:id",
  Effect.gen(function*() {
    const request = yield* HttpServerRequest.HttpServerRequest
    const { id } = yield* HttpRouter.params
    const body = new Uint8Array(yield* Effect.orDie(request.arrayBuffer))
    const answer = yield* receive({
      supplierId: id ?? "",
      signature: request.headers["insyte-signature"] ?? "",
      body
    }).pipe(Effect.orDie)
    return HttpServerResponse.jsonUnsafe(answer.body, { status: answer.status })
  }).pipe(withRequestDb, Effect.withSpan("Suppliers.hookRoute"))
)

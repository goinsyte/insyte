import { Effect } from "effect"
import { HttpRouter } from "effect/http"
import type * as RedirectModule from "./redirect.ts"

/*
 * `GET /r/:slug`, an affiliate's short link (M16 step 4), on the public Worker. The click and its answer load with the
 * first click in an isolate, not with the Worker (ADR-0041 §3): most isolates never see one.
 */

let loading: Promise<typeof RedirectModule> | undefined

const redirect = Effect.promise(() =>
  loading ??= import("./redirect.ts").catch((error: unknown) => {
    loading = undefined
    throw error
  })
)

export const RedirectRoutes = HttpRouter.add("GET", "/r/:slug", Effect.flatMap(redirect, (m) => m.redirect))

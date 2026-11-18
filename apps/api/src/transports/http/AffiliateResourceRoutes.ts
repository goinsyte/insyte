import { Effect, Layer } from "effect"
import { HttpRouter } from "effect/http"
import type * as ResourceModule from "./affiliate-resources.ts"

/*
 * The affiliate programme's material (M16 step 5; widgets/06 Parts B and C), through the console's origin like every
 * route of the session:
 * - `PUT /api/affiliates/resources`: a member at Affiliates · Bewerken uploads a file (the body; its name in
 *   `x-file-name`, its title in `x-resource-title`, its kind in `x-resource-kind`), 25 MB at most.
 * - `GET /api/affiliates/resources/:id`: the member side downloads one (Affiliates · Bekijken).
 * - `GET /api/affiliate/resources/:id`: the affiliate downloads one of its brand's, in its portal; `?download=1` as an
 *   attachment, else an image or a PDF opens inline for its preview.
 * The handlers load with the first such request, not with the Worker (ADR-0041 §3).
 */

let loading: Promise<typeof ResourceModule> | undefined
const routes = Effect.promise(() =>
  loading ??= import("./affiliate-resources.ts").catch((error: unknown) => {
    loading = undefined
    throw error
  })
)

export const AffiliateResourceRoutes = Layer.mergeAll(
  HttpRouter.add("PUT", "/api/affiliates/resources", Effect.flatMap(routes, (m) => m.upload)),
  HttpRouter.add("GET", "/api/affiliates/resources/:id", Effect.flatMap(routes, (m) => m.memberDownload)),
  HttpRouter.add("GET", "/api/affiliate/resources/:id", Effect.flatMap(routes, (m) => m.affiliateDownload))
)

import { HomeRpcs } from "@insyte/api/rpc/HomeRpcs"
import { HomeService } from "@insyte/modules/home/Home"
import { Effect } from "effect"

export const HomeHandlers = HomeRpcs.toLayer(Effect.gen(function*() {
  const home = yield* HomeService
  return HomeRpcs.of({
    "Home.brief": () => home.brief,
    "Home.widgets": (input) => home.widgets(input),
    "Home.revenueBreakdown": ({ range }) => home.revenueBreakdown(range)
  })
}))

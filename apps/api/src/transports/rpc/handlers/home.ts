import { HomeRpcs } from "@insyte/api/rpc/HomeRpcs"
import { HomeService } from "@insyte/modules/home/Home"
import { Effect } from "effect"

export const HomeHandlers = HomeRpcs.toLayer(Effect.gen(function*() {
  const home = yield* HomeService
  return HomeRpcs.of({
    "Home.brief": (input) => home.brief(input ?? {}),
    "Home.widgets": (input) => home.widgets(input),
    "Home.revenueBreakdown": (input) => home.revenueBreakdown(input),
    "Home.work": (input) => home.work(input ?? {}),
    "Home.agenda": (input) => home.agenda(input),
    "Home.activity": (input) => home.activity(input)
  })
}))

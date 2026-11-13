import { RunsRpcs } from "@insyte/api/rpc/RunsRpcs"
import { RunsService } from "@insyte/modules/automations/Runs"
import { Effect } from "effect"

export const RunsHandlers = RunsRpcs.toLayer(Effect.gen(function*() {
  const runs = yield* RunsService
  return RunsRpcs.of({
    "Runs.list": (input) => runs.list(input),
    "Runs.get": ({ id }) => runs.get(id),
    "Runs.stats": (input) => runs.stats(input),
    "Runs.records": (input) => runs.records(input),
    "Runs.rerun": ({ id }) => runs.rerun(id),
    "Runs.cancel": ({ id }) => runs.cancel(id),
    "Runs.approve": (input) => runs.approve(input),
    "Runs.decline": (input) => runs.decline(input)
  })
}))

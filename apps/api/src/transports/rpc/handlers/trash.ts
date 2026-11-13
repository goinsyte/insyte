import { TrashRpcs } from "@insyte/api/rpc/TrashRpcs"
import { TrashService } from "@insyte/modules/trash/Trash"
import { Effect } from "effect"

export const TrashHandlers = TrashRpcs.toLayer(Effect.gen(function*() {
  const trash = yield* TrashService
  return TrashRpcs.of({
    "Trash.list": () => trash.list,
    "Trash.restore": (input) => trash.restore(input),
    "Trash.purge": (input) => trash.purge(input),
    "Trash.empty": () => trash.empty
  })
}))

import { SharedRpcs } from "@insyte/api/rpc/SharedRpcs"
import { UndoService } from "@insyte/modules/undo/Undo"
import { Effect } from "effect"

export const SharedHandlers = SharedRpcs.toLayer(Effect.gen(function*() {
  const undo = yield* UndoService
  return SharedRpcs.of({
    "Shared.undo": ({ token }) => undo.undo(token)
  })
}))

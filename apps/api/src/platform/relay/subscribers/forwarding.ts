import { ForwardSends } from "@insyte/modules/forwarding/domain/Forwarding"
import { Effect } from "effect"
import { subscriber } from "../Subscriber.ts"

export const Forwarding = subscriber("forwarding", {
  // Legs forwarded to their suppliers (M8.2): one Workflow per event, named by it.
  "forwarding.send_requested": (id, event) =>
    Effect.flatMap(
      Effect.service(ForwardSends),
      (sends) => sends.start({ key: `fw-${id}`, workspaceId: event.workspaceId, legIds: event.legIds })
    )
})

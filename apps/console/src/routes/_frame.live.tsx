import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { Forbidden } from "@insyte/domain/Errors"
import { DeniedPanel } from "@insyte/ui/app/access/denied"
import type { Level, Permission } from "@insyte/ui/app/lib/permissions"
import { LivePage } from "@insyte/ui/app/live/live-screen"
import { LiveSourceProvider } from "@insyte/ui/app/live/live-source"
import { createFileRoute } from "@tanstack/react-router"
import { Option, Schema } from "effect"
import { AsyncResult } from "effect/reactivity"
import { liveSnapshotAtom } from "../data/live.ts"
import { type LiveRead, useConsoleLiveSource } from "../live/live-source.tsx"

/**
 * Live (M14 step 3): the reference's `/live` over `Live.snapshot` and the room's frames, in the frame. Nothing is read
 * on the server: the page and the map's land draw at once, and who is on the store comes once the socket is open, as
 * the design's "Verbinden" shows. A role without Analyse Bekijken is told which permission it misses.
 */
export const Route = createFileRoute("/_frame/live")({
  head: () => ({ meta: [{ title: "Live · Insyte" }] }),
  component: LiveRoute
})

const isForbidden = Schema.is(Forbidden)

function LiveRoute() {
  const result = useAtomValue(liveSnapshotAtom)
  const refresh = useAtomRefresh(liveSnapshotAtom)
  const snapshot = Option.getOrUndefined(AsyncResult.value(result))
  const refused = AsyncResult.isFailure(result)
    ? result.cause.reasons.find((r) => r._tag === "Fail" && isForbidden(r.error))
    : undefined
  if (snapshot === undefined && refused !== undefined && refused._tag === "Fail" && isForbidden(refused.error)) {
    return (
      <DeniedPanel
        title="Je rol kan Live niet zien"
        denial={{
          perm: refused.error.permission as Permission,
          arg: refused.error.level as Level,
          roleLabel: refused.error.roleLabel,
          grantingRoles: [],
          granters: [],
          request: { state: "none" },
          action: "Live.snapshot"
        }}
      />
    )
  }
  const read: LiveRead = snapshot !== undefined
    ? { state: "loaded", snapshot, refresh }
    : AsyncResult.isFailure(result) && !result.waiting
    ? { state: "failed", retry: refresh }
    : { state: "waiting" }
  return <Live read={read} />
}

function Live({ read }: { read: LiveRead }) {
  const source = useConsoleLiveSource(read)
  return (
    <LiveSourceProvider value={source}>
      <LivePage />
    </LiveSourceProvider>
  )
}

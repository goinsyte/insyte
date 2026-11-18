import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { SupportBanner } from "@insyte/ui/app/shell/support-banner"
import { useNavigate } from "@tanstack/react-router"
import { AsyncResult } from "effect/reactivity"
import { useEffect, useState } from "react"
import { supportAtom } from "../data/support.ts"

/**
 * The frame's line while Insyte-support looks along (M18). The status comes with every `support` change over the
 * socket; it is read in the browser once the frame is up, again when the tab comes back into view, and the line goes at the session's end on its own.
 */
export function ConsoleSupportBanner() {
  // Read in the browser only: the line is no part of the document the server renders.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted ? <Status /> : null
}

function Status() {
  const result = useAtomValue(supportAtom)
  const refresh = useAtomRefresh(supportAtom)
  const navigate = useNavigate()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const seen = () => {
      if (document.visibilityState === "visible") refresh()
    }
    document.addEventListener("visibilitychange", seen)
    const tick = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => {
      document.removeEventListener("visibilitychange", seen)
      window.clearInterval(tick)
    }
  }, [refresh])
  if (!AsyncResult.isSuccess(result)) return null
  const session = result.value.session
  if (session === null || session.endsAt <= now) return null
  return (
    <SupportBanner
      endsAt={new Date(session.endsAt).toISOString()}
      onOpenSettings={() => void navigate({ to: "/settings/privacy" as never })}
    />
  )
}

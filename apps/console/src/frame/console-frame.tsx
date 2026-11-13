import type { Frame as FrameData } from "@insyte/api/rpc/ShellRpcs"
import { useCommandPalette } from "@insyte/ui/app/hooks/use-command-palette"
import { MarketplaceModal } from "@insyte/ui/app/marketplace/marketplace-modal"
import { CommandPalette } from "@insyte/ui/app/shell/command-palette"
import { Frame } from "@insyte/ui/app/shell/frame"
import { useGoToKeys } from "@insyte/ui/app/shell/goto-keys"
import { useRecentRecords } from "@insyte/ui/app/shell/panel-shortcuts"
import { ShellDialogs } from "@insyte/ui/app/shell/shell-dialogs"
import { usePanel } from "@insyte/ui/app/shell/state"
import { Outlet, useNavigate } from "@tanstack/react-router"
import { useEffect, useRef } from "react"
import { LiveUpdates } from "../realtime/live-updates.tsx"
import { ConsoleShellSource } from "./shell-source.tsx"

/**
 * The console's frame (step 7.4c, M5): the design's `Frame` over the server's `ShellSource`, with what the console opens
 * from it: the palette, the shell's dialogs and the Marketplace (M17 step 3). Ask Insyte leads to its page; Manage to
 * Team (people) or Apps. The realtime socket stays open while it shows.
 */
export function ConsoleFrame({ frame }: { frame: FrameData }) {
  return (
    <ConsoleShellSource frame={frame}>
      <Inside />
    </ConsoleShellSource>
  )
}

function Inside() {
  const navigate = useNavigate()
  const palette = useCommandPalette()
  const main = useRef<HTMLElement>(null)
  useRecentRecords()
  useGoToKeys(true)
  // The density the panel's Customize dialog chose, as one attribute the stylesheet reads.
  const density = usePanel((s) => s.density)
  useEffect(() => {
    document.documentElement.dataset["density"] = density
  }, [density])
  const ask = () => void navigate({ to: "/ask" as never })

  return (
    <>
      <Frame
        persona="admin"
        main={main}
        onAskInsyte={ask}
        onOpenPalette={() => palette.setOpen(true)}
        onOpenManage={(tab) => void navigate({ to: (tab === "people" ? "/settings/team" : "/settings/apps") as never })}
      >
        <Outlet />
      </Frame>
      <CommandPalette open={palette.open} onOpenChange={palette.setOpen} persona="admin" onAskInsyte={ask} />
      <ShellDialogs />
      <MarketplaceModal />
      <LiveUpdates />
    </>
  )
}

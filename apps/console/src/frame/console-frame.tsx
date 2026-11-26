import type { Frame as FrameData } from "@insyte/api/rpc/ShellRpcs"
import { AskSourceProvider } from "@insyte/ui/app/ask/ask-source"
import { useCommandPalette } from "@insyte/ui/app/hooks/use-command-palette"
import { SettleOnArrival } from "@insyte/ui/app/loading/settle"
import { RouterProgress } from "@insyte/ui/app/loading/stream"
import { MarketplaceModal } from "@insyte/ui/app/marketplace/marketplace-modal"
import { AskInsyteContext } from "@insyte/ui/app/shell/ask-insyte-context"
import { AskInsytePanel } from "@insyte/ui/app/shell/ask-insyte-panel"
import { CommandPalette } from "@insyte/ui/app/shell/command-palette"
import { Frame } from "@insyte/ui/app/shell/frame"
import { useGoToKeys } from "@insyte/ui/app/shell/goto-keys"
import { useRecentRecords } from "@insyte/ui/app/shell/panel-shortcuts"
import { ShellDialogs } from "@insyte/ui/app/shell/shell-dialogs"
import { usePanel } from "@insyte/ui/app/shell/state"
import { Outlet, useNavigate } from "@tanstack/react-router"
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react"
import { useConsoleAskSource } from "../ask/ask-source.ts"
import { LiveUpdates } from "../realtime/live-updates.tsx"
import { ConsoleShellSource } from "./shell-source.tsx"
import { ConsoleSupportBanner } from "./support-banner.tsx"

/**
 * The console's frame (step 7.4c, M5): the design's `Frame` over the server's `ShellSource`, with what the console opens
 * from it: the palette, the shell's dialogs and the Marketplace (M17 step 3). Ask Insyte opens the design's panel beside
 * the page, over the same `Ask.*` as `/ask` (M15 step 3); Manage leads to Team (people) or Apps. The realtime socket
 * stays open while it shows.
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
  const [askOpen, setAskOpen] = useState(false)
  const ask = () => setAskOpen(true)
  // ⌘K the palette, ⌘J Vraag Insyte beside the page.
  const palette = useCommandPalette(ask)
  const main = useRef<HTMLElement>(null)
  useRecentRecords()
  useGoToKeys(true)
  // The density the panel's Customize dialog chose, as one attribute the stylesheet reads.
  const density = usePanel((s) => s.density)
  useEffect(() => {
    document.documentElement.dataset["density"] = density
  }, [density])
  const askContext = useMemo(() => ({ open: () => setAskOpen(true) }), [])

  return (
    <AskInsyteContext.Provider value={askContext}>
      <Frame
        persona="admin"
        main={main}
        above={
          <>
            <RouterProgress />
            <ConsoleSupportBanner />
          </>
        }
        onAskInsyte={ask}
        onOpenPalette={() => palette.setOpen(true)}
        onOpenManage={(tab) => void navigate({ to: (tab === "people" ? "/settings/team" : "/settings/apps") as never })}
      >
        <SettleOnArrival value>
          <Outlet />
        </SettleOnArrival>
      </Frame>
      <CommandPalette open={palette.open} onOpenChange={palette.setOpen} persona="admin" onAskInsyte={ask} />
      <ShellDialogs />
      <MarketplaceModal />
      <LiveUpdates />
      <AskPanel open={askOpen} onOpenChange={setAskOpen} />
    </AskInsyteContext.Provider>
  )
}

/** The top bar's Vraag Insyte, its conversations read only while it is open. */
function AskPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  // Kept mounted once opened, so a conversation stays where it was between one opening and the next.
  const [opened, setOpened] = useState(open)
  useEffect(() => {
    if (open) setOpened(true)
  }, [open])
  if (!opened) return null
  return (
    <PanelSource>
      <AskInsytePanel open={open} onOpenChange={onOpenChange} />
    </PanelSource>
  )
}

function PanelSource({ children }: { children: ReactNode }) {
  return <AskSourceProvider value={useConsoleAskSource("panel")}>{children}</AskSourceProvider>
}

import { PersonaSwitcher } from "./persona-switcher"
import { Toaster } from "../../components/sonner"
import { Outlet } from "@tanstack/react-router"
import { MotionConfig } from "motion/react"
import { DemoGateRole } from "../access/demo-gate-role"
import { DemoTeamSource } from "../team/demo-source"

export function RootDocument() {
  return (
    <MotionConfig reducedMotion="user">
      {/* Shared parts and the team screens read the demo stores through these, wherever they are mounted. */}
      <DemoGateRole>
        <DemoTeamSource>
          <Outlet />
          <Toaster richColors position="bottom-center" />
          <PersonaSwitcher />
        </DemoTeamSource>
      </DemoGateRole>
    </MotionConfig>
  )
}

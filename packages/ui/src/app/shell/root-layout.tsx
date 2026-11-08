import { PersonaSwitcher } from "./persona-switcher"
import { Toaster } from "../../components/sonner"
import { Outlet } from "@tanstack/react-router"
import { MotionConfig } from "motion/react"
import { DemoGateRole } from "../access/demo-gate-role"
import { DemoTeamSource } from "../team/demo-source"
import { DemoShellSource } from "./demo-source"

export function RootDocument() {
  return (
    <MotionConfig reducedMotion="user">
      {/* Shared parts and the team screens read the demo stores through these, wherever they are mounted. */}
      <DemoGateRole>
        <DemoTeamSource>
          <DemoShellSource>
            <Outlet />
            <Toaster richColors position="bottom-center" />
            <PersonaSwitcher />
          </DemoShellSource>
        </DemoTeamSource>
      </DemoGateRole>
    </MotionConfig>
  )
}

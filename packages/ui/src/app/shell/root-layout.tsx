import { PersonaSwitcher } from "./persona-switcher"
import { Toaster } from "../../components/sonner"
import { Outlet } from "@tanstack/react-router"
import { MotionConfig } from "motion/react"
import { DemoGateRole } from "../access/demo-gate-role"
import { DemoTeamSource } from "../team/demo-source"
import { DemoSupplierPortal } from "../supplier/demo-source"
import { DemoAgentLogSource } from "../ask/agent-demo"
import { DemoShellSource } from "./demo-source"

export function RootDocument() {
  return (
    <MotionConfig reducedMotion="user">
      {/* Shared parts, the team screens, Insyte's log and the supplier portal read the demo stores through these, wherever they are mounted. */}
      <DemoGateRole>
        <DemoTeamSource>
          <DemoShellSource>
            <DemoAgentLogSource>
              <DemoSupplierPortal>
                <Outlet />
                <Toaster richColors position="bottom-center" />
                <PersonaSwitcher />
              </DemoSupplierPortal>
            </DemoAgentLogSource>
          </DemoShellSource>
        </DemoTeamSource>
      </DemoGateRole>
    </MotionConfig>
  )
}

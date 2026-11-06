import { PersonaSwitcher } from "./persona-switcher"
import { Toaster } from "../../components/sonner"
import { Outlet } from "@tanstack/react-router"
import { MotionConfig } from "motion/react"

export function RootDocument() {
  return (
    <MotionConfig reducedMotion="user">
      <Outlet />
      <Toaster richColors position="bottom-center" />
      <PersonaSwitcher />
    </MotionConfig>
  )
}

import { createFileRoute, redirect } from "@tanstack/react-router"

/** `/settings` (the nav's Instellingen, the avatar's Winkelinstellingen) opens Account, as in the reference. */
export const Route = createFileRoute("/_frame/settings/")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/profile", replace: true })
  }
})

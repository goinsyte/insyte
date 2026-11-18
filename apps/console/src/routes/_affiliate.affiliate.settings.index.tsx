import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_affiliate/affiliate/settings/")({
  beforeLoad: () => {
    throw redirect({ to: "/affiliate/settings/profile" })
  }
})

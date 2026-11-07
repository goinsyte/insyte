import { createFileRoute, redirect } from "@tanstack/react-router"

/** Registering is the onboarding's first step, as in the design reference. */
export const Route = createFileRoute("/register")({
  beforeLoad: () => {
    throw redirect({ to: "/onboarding" })
  }
})

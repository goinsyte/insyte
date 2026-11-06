import { createFileRoute, redirect } from "@tanstack/react-router"

/**
 * `/` is the marketing landing page in the legacy app, and that page is `apps/marketing` here. This
 * app starts where the dashboard starts.
 */
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" })
  }
})

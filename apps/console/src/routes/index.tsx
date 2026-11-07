import { createFileRoute, redirect } from "@tanstack/react-router"

/** Until sign-in exists (step 1), the console's front door is its status page. */
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/status", statusCode: 302 })
  }
})

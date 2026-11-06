import { createFileRoute, redirect } from "@tanstack/react-router"

/**
 * `/` is not a page in this router: the brand book lives at `/brand` (its cover), and the reference's
 * front door at `/` is a different section (`src/home`). Anything that reaches this route is sent to
 * the cover.
 */
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/brand" })
  }
})

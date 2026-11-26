import { createFileRoute } from "@tanstack/react-router"
import { InAppNotFound } from "../frame/not-found.tsx"

/**
 * Vraag Insyte has no layout of its own, so an address under it that no page answers (`/ask/x`) would match nothing and
 * leave the frame: this catches it inside, where the frame says it is not there.
 */
export const Route = createFileRoute("/_frame/ask/$")({
  head: () => ({ meta: [{ title: "Niet gevonden · Insyte" }] }),
  component: InAppNotFound
})

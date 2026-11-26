import { createFileRoute } from "@tanstack/react-router"
import { InAppNotFound } from "../frame/not-found.tsx"

/**
 * Instellingen has no layout of its own, so an address under it that no page answers (`/settings/region`) would match
 * nothing and leave the frame: this catches it inside, where the frame says it is not there.
 */
export const Route = createFileRoute("/_frame/settings/$")({
  head: () => ({ meta: [{ title: "Niet gevonden · Insyte" }] }),
  component: InAppNotFound
})

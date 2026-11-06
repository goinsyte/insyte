import { createFileRoute } from "@tanstack/react-router"

/** A chapter, `/brand/kleur`. The layout draws it from the registry, and says so when it does not exist. */
export const Route = createFileRoute("/brand/$chapter")({})

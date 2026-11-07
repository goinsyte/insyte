import { StartClient } from "@tanstack/react-start/client"
import { StrictMode } from "react"
import { hydrateRoot } from "react-dom/client"
import { startObservability } from "./observability.ts"

/** The browser entry: Sentry starts before hydration, so an error while hydrating is caught too. */
startObservability()

hydrateRoot(
  document,
  <StrictMode>
    <StartClient />
  </StrictMode>
)

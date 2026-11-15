import { AskPage } from "@insyte/ui/app/ask/ask-screen"
import { AskSourceProvider } from "@insyte/ui/app/ask/ask-source"
import { createFileRoute } from "@tanstack/react-router"
import { useConsoleAskSource } from "../ask/ask-source.ts"

/**
 * Vraag Insyte (`/ask`, M15 step 3): the reference's page over `Ask.*`, in the frame. Conversations on the left, the open
 * one (`?c=`) in the middle, what its last answer read on the right. Each conversation is its owner's alone; the answers
 * read only what the viewer may see.
 */
export const Route = createFileRoute("/_frame/ask/")({
  validateSearch: (s: Record<string, unknown>): { c?: string } => (typeof s["c"] === "string" ? { c: s["c"] } : {}),
  head: () => ({ meta: [{ title: "Vraag Insyte · Insyte" }] }),
  component: AskRoute
})

function AskRoute() {
  return (
    <AskSourceProvider value={useConsoleAskSource()}>
      <AskPage />
    </AskSourceProvider>
  )
}

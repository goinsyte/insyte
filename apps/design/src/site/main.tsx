import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { PAGES } from "./pages.tsx"
// The landing page's own stylesheet, the one `apps/marketing` loads.
import "@insyte/ui/marketing/landing.css"

/**
 * `/site/*`: the marketing site, the same `@insyte/ui/marketing` pages `apps/marketing` serves.
 *
 * What `apps/marketing`'s root route puts around every page is reproduced here: `class="light"` on
 * `<html>` (set before paint in `index.html`), `lang="nl"`, `antialiased` on `<body>`, and the skip
 * link to `#main`. What it puts in `<head>` per page — title, canonical, Open Graph — is that
 * deployment's, and stays there.
 */
const path = window.location.pathname.replace(/^\/site/, "").replace(/\/$/, "") || "/"
const Page = PAGES[path]

document.body.classList.add("antialiased")

const root = document.getElementById("root")

if (root === null) throw new Error("index.html has no #root")

createRoot(root).render(
  <StrictMode>
    {/* Visually hidden until focused. `#main` is the hero's headline block. */}
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-paper focus:px-4 focus:py-2 focus:ring-2 focus:ring-arc"
    >
      Naar de inhoud
    </a>
    {Page === undefined
      ? (
        <main className="mx-auto flex min-h-svh max-w-xl flex-col justify-center gap-4 px-6">
          <h1 className="font-medium text-2xl text-ink">Deze pagina bestaat niet</h1>
          <p className="text-ink-2">
            <a className="underline" href="/site">Naar de marketingsite</a> of{" "}
            <a className="underline" href="/">naar het overzicht</a>.
          </p>
        </main>
      )
      : <Page />}
  </StrictMode>
)

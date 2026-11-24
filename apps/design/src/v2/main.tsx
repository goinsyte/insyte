import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./app.tsx"
import { applyStoredTheme } from "./ui/theme.ts"
import { applyInitialVariant } from "./variants.ts"
// Version 2's own stylesheet: its tokens and faces, never the console's `app.css`.
import "./v2.css"

/**
 * `/v2/*`: a second version of the product demo, built from the product owner's screens of
 * 21 November 2026 (the shell with the werkdraad, Magnus, an agent's page) plus Home and an Analyse
 * board. Fixtures only, no backend; it runs beside `/app` and shares nothing with it but the icons.
 */
const root = document.getElementById("root")

if (root === null) throw new Error("index.html has no #root")

// The accent and light or dark, before the first paint (`ui/theme.ts`).
applyStoredTheme()
// The variant (`variants.ts`): a `?v=` in the address wins over the remembered one.
applyInitialVariant()
document.documentElement.lang = "nl"

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)

import { Brand } from "@insyte/ui/brand/kit"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
// The generated token stylesheet, which is this page's whole point and the reason it is a separate
// document: it imports Tailwind and the tokens itself, as the brand book's stylesheet does.
import "@insyte/ui/brand/kit.css"

const root = document.getElementById("root")

if (root === null) throw new Error("index.html has no #root")

createRoot(root).render(
  <StrictMode>
    <Brand />
  </StrictMode>
)

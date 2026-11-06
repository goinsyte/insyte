import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { Home } from "./home.tsx"
// The product's own stylesheet: the front door is drawn in the console's world, on the tokens.
import "@insyte/ui/app/app.css"

const root = document.getElementById("root")

if (root === null) throw new Error("index.html has no #root")

document.documentElement.classList.add("light")

createRoot(root).render(
  <StrictMode>
    <Home />
  </StrictMode>
)

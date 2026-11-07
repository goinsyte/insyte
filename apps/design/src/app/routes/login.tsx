import { LoginPage } from "@insyte/ui/app/auth/login-screen"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/login")({
  // Optional `?redirect=` so flows like invite-accept can return here, then
  // continue where they left off after sign-in. `?error=` is what a Google round trip came back with.
  validateSearch: (search: Record<string, unknown>): { redirect?: string; error?: string } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
    error: typeof search.error === "string" ? search.error : undefined
  }),
  component: LoginPage
})

import { LoginPage } from "@insyte/ui/app/auth/login-screen"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/login")({
  // Optional `?redirect=` so flows like invite-accept can return here, then
  // continue where they left off after sign-in.
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined
  }),
  component: LoginPage
})

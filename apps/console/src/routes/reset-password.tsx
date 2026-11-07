import { ResetPasswordPage } from "@insyte/ui/app/auth/reset-password-screen"
import { search } from "@insyte/ui/app/auth/reset-password-search"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/reset-password")({
  validateSearch: search,
  head: () => ({ meta: [{ title: "Nieuw wachtwoord · Insyte" }] }),
  component: ResetPasswordPage
})

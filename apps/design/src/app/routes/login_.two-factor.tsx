import { TwoFactorPage } from "@insyte/ui/app/auth/two-factor-screen"
import { search } from "@insyte/ui/app/auth/two-factor-search"
import { createFileRoute } from "@tanstack/react-router"

/** `login_`: beside `/login`, not inside it (the sign-in screen renders no outlet). */
export const Route = createFileRoute("/login_/two-factor")({
  validateSearch: search,
  component: TwoFactorPage
})

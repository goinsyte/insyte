import type { AreaDef } from "../../areas.ts"
import type { AreaRoute } from "../../router.tsx"
import { InvitationScreen } from "./invitation.tsx"
import { LoginScreen, TwoFactorScreen } from "./login.tsx"
import { OnboardingScreen } from "./onboarding.tsx"
import { ResetPasswordScreen } from "./reset.tsx"

/*
 * Inloggen: signing in, the second step, the reset link, an invitation and setting up. Every page
 * draws its own frame on the bare layout (`shell/bare.tsx`); `route.base` picks which.
 */

function pageLabel(route: AreaRoute): string {
  switch (route.base) {
    case "inloggen":
      return route.path[0] === "twee-stappen" ? "Tweestapsverificatie" : "Inloggen"
    case "registreren":
      return "Account aanmaken"
    case "wachtwoord-herstellen":
      return "Wachtwoord herstellen"
    case "uitnodiging":
      return "Uitnodiging"
    default:
      return "Inrichten"
  }
}

function Screen({ route }: { readonly route: AreaRoute }) {
  switch (route.base) {
    case "inloggen":
      return route.path[0] === "twee-stappen" ? <TwoFactorScreen /> : <LoginScreen />
    case "registreren":
      return <OnboardingScreen register />
    case "wachtwoord-herstellen":
      return <ResetPasswordScreen />
    case "uitnodiging":
      return <InvitationScreen id={route.path[0] ?? ""} />
    default:
      return <OnboardingScreen slug={route.path[0]} />
  }
}

export const area: AreaDef = {
  Screen,
  thread: (route) => ({ items: [{ kind: "page", label: pageLabel(route) }], ask: null })
}

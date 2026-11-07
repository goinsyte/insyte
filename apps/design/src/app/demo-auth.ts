/**
 * The design reference's auth client: answers the calls the screens make from the fixtures. Written for this repo
 * (ADR-0004); the seam it fills is `@insyte/ui/app/lib/auth-client`, and the console fills it with better-auth's.
 *
 * Legacy's dashboard layout calls `getSession()` before rendering anything, so a client with no server would redirect
 * every screen to `/login`. This stand-in is deliberately NOT a fake auth system: there is one session, it is always
 * present, and nothing here decides anything. The point is that the gate, the sign-in form, the reset dialog and the
 * onboarding steps run unedited.
 *
 * Which means the sign-in form signs no one in. It validates with its own schema, shows its own pending and error
 * states, and then navigates, the same thing it does against the real client, except that the session it lands on was
 * already there. Nothing is sent anywhere; there is nothing to send it to.
 *
 * Installed by `install-auth.ts`, which `boot.tsx` imports first: it reads the data source at module load, so it must
 * run after `install.ts`, and only the dynamic import of `boot.tsx` guarantees that in the bundle.
 */
import type { AuthClient } from "@insyte/ui/app/lib/auth-client"
import { useTeam } from "@insyte/ui/app/stores/team-store"
import { currentUserByPersona, members, org } from "@insyte/ui/data-source"

/* The admin persona, which is the one the dashboard's layout route gates on. */
const currentUser = currentUserByPersona.admin

const session = {
  session: { id: "session_mock", userId: currentUser.id, expiresAt: new Date(2099, 0, 1) },
  user: {
    id: currentUser.id,
    name: currentUser.name,
    email: currentUser.email,
    emailVerified: true,
    image: currentUser.avatar_url
  }
}

/** Better-auth's organization shape, as the two screens that read it use it. */
const activeOrganization = {
  id: org.id,
  name: org.name,
  slug: org.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-"),
  logo: org.logo_url,
  billingPlan: org.billing_plan,
  members: members.map((member) => ({
    id: member.id,
    role: member.role,
    user: { id: member.id, name: member.name, email: member.email, image: member.avatar_url }
  }))
}

/** Better-auth answers every call with `{ data, error }`, and every ported call site reads it that
 * way: `if (error)` first, then the data. So does this. */
const ok = <A>(data: A) => Promise.resolve({ data, error: null as { message?: string } | null })

export const demoAuthClient: AuthClient = {
  getSession: () => Promise.resolve({ data: session, error: null }),

  /*
   * Email sign-in and sign-up, which succeed for any input that passes the form's own validators.
   * The alternative — failing, or checking against the mock user — would make the error state the
   * normal one and leave the screens past this point unreachable, which is the opposite of what a
   * frontend port is for.
   */
  signIn: {
    // Never paused for a second factor: the reference's one person has none (open `/login/two-factor` to see it).
    email: (_credentials: { email: string; password: string }) => ok({ twoFactorRedirect: false }),

    /*
     * Real social sign-in is a full-page handoff: better-auth sends the browser to the provider and
     * the provider sends it back to `callbackURL`. Only the middle of that needs a server, so this
     * does the two ends — it goes straight to the callback, which is where a successful round trip
     * would have landed. Both call sites pass an absolute URL on this origin.
     */
    social: ({ callbackURL }: { provider: string; callbackURL: string }) => {
      window.location.assign(callbackURL)
      return ok(session)
    }
  },

  signUp: {
    email: (_account: { email: string; password: string; name: string }) => ok(session)
  },

  /* No mail server: each send "goes out" after a beat, so the dialog's pending state is seen, and lands nowhere. */
  sendVerificationEmail: (_request: { email: string; callbackURL?: string | undefined }) => ok(null),
  requestPasswordReset: (_request: { email: string; redirectTo: string }) =>
    new Promise((resolve) => setTimeout(() => resolve({ data: null, error: null }), 700)),
  resetPassword: (_request: { newPassword: string; token: string }) => ok(null),

  /* The one session is the reference's whole premise, so signing out keeps it: the screen still navigates. */
  signOut: () => ok(null),

  /* Any code passes: the screen's own validation and states are what the reference shows. */
  twoFactor: {
    verifyTotp: (_request: { code: string; trustDevice: boolean }) => ok(session),
    verifyBackupCode: (_request: { code: string; trustDevice: boolean }) => ok(session)
  },

  organization: {
    /** The onboarding step patches the returned id into its state and sends it on to
     * `persistStep`, so this answers with the organisation the rest of the app already shows,
     * under the name and slug the operator just typed. */
    create: ({ name, slug }: { name: string; slug: string }) => {
      /* "Nieuwe werkruimte" in the switcher runs this same step; the new one joins the person's list. */
      if (useTeam.getState().creatingWorkspace) useTeam.getState().addWorkspace(name)
      return ok({ ...activeOrganization, name, slug })
    }
  }
}

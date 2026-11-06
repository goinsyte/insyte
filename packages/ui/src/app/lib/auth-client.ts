/**
 * NOT PORTED — written for this repo. See ADR-0004, and ADR-0005 for why the check is gone.
 *
 * Legacy builds a better-auth React client against the Elysia server: `baseURL` points at
 * `/api/auth/**`, the session rides in a cross-origin cookie, and the organization plugin shares an
 * access-control instance with the server so client-side permission checks resolve against the same
 * source of truth.
 *
 * None of that exists here, and the consequence is not cosmetic: the dashboard's layout route calls
 * `getSession()` before rendering anything, so a client with no server redirects every screen to
 * `/login`. That is why the legacy dashboard cannot be rendered locally and why this port has no
 * rendered comparison.
 *
 * This stand-in answers the calls the ported screens make, from `lib/mock-data` — the same place
 * every other number on these screens comes from. It is deliberately NOT a fake auth system: there
 * is one session, it is always present, and nothing here decides anything. The point is that the
 * ported gate, the store selector, the team screen, the sign-in form and the eight onboarding steps
 * run unedited.
 *
 * Which means the sign-in form signs no one in. It validates with its own zod schema, shows its own
 * pending and error states, and then navigates — the same thing it does against the real client,
 * except that the session it lands on was already there. Nothing is sent anywhere; there is nothing
 * to send it to.
 */
import { currentUserByPersona } from "../../data-source"
import { members } from "../../data-source"
import { org } from "../../data-source"
import { useTeam } from "../stores/team-store"

/* The admin persona, which is the one the dashboard's layout route gates on. */
const currentUser = currentUserByPersona.admin

const session = {
  session: { id: "session_mock", userId: currentUser.id, expiresAt: new Date(2099, 0, 1) },
  user: { id: currentUser.id, name: currentUser.name, email: currentUser.email, image: currentUser.avatar_url }
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

const failed = (message: string) => Promise.resolve({ data: null, error: { message } })

export const authClient = {
  getSession: () => Promise.resolve({ data: session, error: null }),

  useActiveOrganization: () => ({ data: activeOrganization, error: null, isPending: false }),

  /*
   * Email sign-in and sign-up, which succeed for any input that passes the form's own validators.
   * The alternative — failing, or checking against the mock user — would make the error state the
   * normal one and leave the screens past this point unreachable, which is the opposite of what a
   * frontend port is for.
   */
  signIn: {
    email: (_credentials: { email: string; password: string }) => ok(session),

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

  organization: {
    /** The onboarding step patches the returned id into its state and sends it on to
     * `persistStep`, so this answers with the organisation the rest of the app already shows,
     * under the name and slug the operator just typed. */
    create: ({ name, slug }: { name: string; slug: string }) => {
      /* "Nieuwe werkruimte" in the switcher runs this same step; the new one joins the person's list. */
      if (useTeam.getState().creatingWorkspace) useTeam.getState().addWorkspace(name)
      return ok({ ...activeOrganization, name, slug })
    },

    /*
     * The invite-accept landing, which is the one call here that can fail — and should, because its
     * route renders four different outcomes and three of them are failures.
     *
     * The mock workspace has one pending invitation, Amber's, so that id is accepted and anything
     * else is not found. Legacy's route maps a "not found" message to its expired screen; that
     * mapping is its own, and it is left exactly as written.
     */
    acceptInvitation: ({ invitationId }: { invitationId: string }) => {
      const pending = members.find((member) => member.status === "invited" && member.id === invitationId)
      return pending ? ok({ invitation: { id: pending.id }, member: pending }) : failed("Invitation not found.")
    },

    /*
     * Succeeds, because the screen's own code is what is being ported: it toasts on success and
     * shows the error otherwise, and a stand-in that always failed would show an error state as the
     * normal one. Nothing is sent anywhere — there is no server to send it to.
     */
    inviteMember: (_invite: { email: string; role: string; organizationId?: string }) => ok(null)
  }
}

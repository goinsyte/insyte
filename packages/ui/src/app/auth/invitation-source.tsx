import type { Landing, LandingState } from "../lib/invitation-types"
import type { HumanCheckController } from "./human-check"

/**
 * What the invitation landing reads and does, from whoever hosts it (as `team/source.tsx` for the team screens): the
 * design app answers from its demo stores, the console from `Landing.resolve` and better-auth. The landing holds only
 * its own steps (which phase, the name typed, the photo picked).
 *
 * An action that can fail answers the sentence to show, or `null` when it took; the rest answer whether they took.
 */
export interface InvitationSource {
  inv: Landing
  /** The label of the role the invitation grants; empty when it grants none. */
  role: string
  /** What that role may do, in the roles matrix's sentences. */
  abilities: ReadonlyArray<string>
  /** "Alle winkels", or the stores by name. */
  storesLabel: string
  /** The workspace's seats, for the full state. */
  seatsTotal: number
  /** The human check the forms carry where the host asks for one (sign-up and a reset always; the design never). */
  human?: HumanCheckController | undefined
  /** Whoever is signed in, when someone is. */
  signedInAs: { name: string; email: string } | null
  /** Mail addresses to write to, where the host may show them; without, those buttons ask the server instead. */
  mailto?: { revoked?: string; otherAccount?: string }

  /** Makes the account (new, link, supplier, affiliate). */
  createAccount: (input: { name: string; email: string; password: string; company: string }) => Promise<string | null>
  /** Signs in with the password (existing). */
  signIn: (password: string) => Promise<string | null>
  /** Continues with Google (or Google Workspace for `sso`); answers whether the page goes on here. */
  continueWithGoogle: (sso: boolean) => Promise<boolean>
  /** "Vergeten?": sends the reset link. */
  resetPassword: () => void
  /** "Uitloggen en doorgaan als …": answers the state the page shows next. */
  switchAccount: () => Promise<LandingState | undefined>
  /** Asks the inviter for a new invitation (expired, revoked, the wrong account signed in). */
  requestNew: () => Promise<boolean>
  /** Asks the inviter for a seat (full). */
  requestSeat: () => Promise<boolean>
  /** Joins the workspace with what the steps gathered (or straight from signing in), and goes there. */
  join: (input: {
    name: string
    photo?: string | undefined
    field: number
    notify: { on: number; email: boolean }
    via: "steps" | "sign-in"
  }) => Promise<void>
  /** A supplier or affiliate carries on in their own onboarding; absent where the host has no portals yet. */
  joinPartner?: (name: string, state: LandingState) => void
  /** "Naar …" on an invitation already accepted. */
  openWorkspace: () => void
}

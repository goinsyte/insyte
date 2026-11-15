import { useAtomSet } from "@effect/atom-react"
import { RegistryContext } from "@effect/atom-react"
import { fieldCopy } from "@insyte/ui/app/lib/errors"
import { Cause, Effect, Exit, Option } from "effect"
import { AtomRegistry } from "effect/reactivity"
import { useContext } from "react"
import { sessionMeAtom } from "../data/session.ts"
import { workspaceWrites } from "../data/workspaces.ts"
import { reloadInto } from "../frame/switching.ts"

/** What the organisation step hands over (its `NewWorkspace`, restated: a screen stays out of this program). */
interface NewWorkspace {
  readonly name: string
  readonly slug: string
  readonly country: string
  readonly teamSize: string
}

/** The organisation step's place in the admin track: account, verify, role, organisation. */
export const ORGANIZATION_STEP = 3

/**
 * "Nieuwe werkruimte" in onboarding (M3.1): the organisation step makes the workspace (`Workspaces.create`) and the
 * session goes on in it; the page loads afresh into onboarding, which the server resumes on the new workspace's plan
 * step. Leaving onboarding goes back to another workspace the person has, rather than signing out.
 */
export function useAnotherWorkspace() {
  const make = useAtomSet(workspaceWrites.create, { mode: "promiseExit" })
  const toOther = useAtomSet(workspaceWrites.switch, { mode: "promiseExit" })
  const registry = useContext(RegistryContext)

  const create = async (workspace: NewWorkspace) => {
    const exit = await make({ payload: workspace })
    if (Exit.isSuccess(exit)) {
      reloadInto(exit.value.landing)
      return undefined
    }
    const failure = Cause.findErrorOption(exit.cause)
    if (failure._tag === "Some" && failure.value._tag === "Invalid") return fieldCopy(failure.value.fields)
    return "Je werkruimte kon niet worden aangemaakt. Probeer het opnieuw."
  }

  /** Back to another workspace: the one they came from (`another`), or the newest other. `false` when there is none. */
  const leaveToAnother = async (another: boolean) => {
    if (another) {
      reloadInto("/dashboard")
      return true
    }
    const me = await Effect.runPromise(Effect.option(AtomRegistry.getResult(registry, sessionMeAtom)))
    if (Option.isNone(me)) return false
    const active = me.value.activePrincipal?.workspaceId
    const other = me.value.principals.find((p) => p.kind === "member" && p.workspaceId !== active)
    if (other === undefined) return false
    const exit = await toOther({ payload: { workspaceId: other.workspaceId } })
    if (Exit.isFailure(exit)) return false
    reloadInto(exit.value.landing)
    return true
  }

  return { create, leaveToAnother }
}

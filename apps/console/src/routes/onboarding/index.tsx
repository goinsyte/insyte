import { authClient } from "@insyte/ui/app/lib/auth-client"
import { search } from "@insyte/ui/app/onboarding/onboarding-search"
import { OnboardingShell, type StepDef } from "@insyte/ui/app/onboarding/onboarding-shell"
import { sharedHeadSteps } from "@insyte/ui/app/onboarding/shared-steps"
import { useOnboardingState } from "@insyte/ui/app/onboarding/use-onboarding-state"
import { createFileRoute } from "@tanstack/react-router"
import { useEffect } from "react"

/**
 * Step 1's onboarding: the design reference's shell and its shared head (account, verify, role), built by the same
 * step builder, against better-auth. What follows the role is step 2 (15), which mounts the reference's whole
 * `OnboardingPage` here, with the progress on the server; until then the flow ends on a step that says so (11 §7.3).
 *
 * `?step=` is the reference's deep link, and the verification link lands on `?step=2`, the role, signed in.
 */
export const Route = createFileRoute("/onboarding/")({
  validateSearch: search,
  head: () => ({ meta: [{ title: "Aan de slag · Insyte" }] }),
  component: OnboardingHead
})

const AFTER_ROLE: StepDef = {
  id: "next",
  title: "Je account staat klaar.",
  subtitle: "De volgende stappen van de onboarding zijn nog niet beschikbaar. Je kunt dit venster sluiten.",
  hidePrimary: true,
  content: null
}

function OnboardingHead() {
  const { step } = Route.useSearch()
  const navigate = Route.useNavigate()
  const state = useOnboardingState({ stepIndex: step ?? 0 })

  // Signed in and verified with no step in the address (sign-in lands here through `/dashboard`): on to the role, as
  // the reference's own screen resumes from the session on mount. Step 2 reads the step from the server instead.
  useEffect(() => {
    if (step !== undefined) return
    void authClient.getSession().then(({ data }) => {
      if (data?.user.emailVerified === true) state.setStepIndex(2)
    })
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, [])

  // The step in the address, so a reload or the back button lands where the person was.
  useEffect(() => {
    void navigate({ search: { step: state.stepIndex }, replace: true })
  }, [navigate, state.stepIndex])

  const steps = [
    ...sharedHeadSteps({
      data: state.data,
      patch: state.patch,
      next: state.next,
      setPersona: (persona) => {
        state.setPersona(persona)
        state.setStepIndex(3)
      }
    }),
    AFTER_ROLE
  ]

  return (
    <OnboardingShell
      persona={null}
      steps={steps}
      stepIndex={state.stepIndex}
      onBack={() => state.back()}
      onChangeRole={() => state.setStepIndex(2)}
      onExit={async () => {
        // Leaving the flow signs out: there is nothing else to go to yet. No reset first: the step would be written back
        // into the address over this navigation, and leaving the route drops the state anyway.
        await authClient.signOut()
        await navigate({ to: "/login", search: {} })
      }}
    />
  )
}

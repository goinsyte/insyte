import { createElement, type FunctionComponent } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeAll, describe, expect, it } from "vitest"

/*
 * The onboarding shell's primary while a step's data is still on its way (`pending`): it shows its busy state and
 * cannot be pressed, so a step never acts on what it has not read yet (the offline step's plan is made on the
 * autonomy policy's version, and only one the server answered). Rendered on the server: no DOM needed. Loaded by its
 * package name, as the console loads it (the design's sources are type-checked by their own project).
 */

interface Step {
  id: string
  title: string
  primaryLabel?: string
  pending?: boolean
  pendingLabel?: string
  onPrimary?: () => void
  content: null
}

let OnboardingShell: FunctionComponent<{
  persona: "admin"
  steps: Array<Step>
  stepIndex: number
  onBack: () => void
  onChangeRole: () => void
  onExit: () => void
}>

beforeAll(async () => {
  const specifier = "@insyte/ui/app/onboarding/onboarding-shell"
  OnboardingShell = ((await import(/* @vite-ignore */ specifier)) as { OnboardingShell: typeof OnboardingShell })
    .OnboardingShell
})

const shell = (step: Partial<Step>) =>
  renderToStaticMarkup(
    createElement(OnboardingShell, {
      persona: "admin",
      steps: [{ id: "offline", title: "Terwijl je offline bent.", primaryLabel: "Afronden", content: null, ...step }],
      stepIndex: 0,
      onBack: () => undefined,
      onChangeRole: () => undefined,
      onExit: () => undefined
    })
  )

const primary = (html: string) => html.match(/<button[^>]*aria-busy="(?:true|false)"[^>]*>.*?<\/button>/s)?.[0] ?? ""

describe("the onboarding shell's primary", () => {
  it("waits in its busy state, unpressable, while the step's data is read", () => {
    const button = primary(shell({ pending: true, pendingLabel: "Bezig met laden", onPrimary: () => undefined }))
    expect(button).toContain("aria-busy=\"true\"")
    expect(button).toMatch(/ disabled=""/)
    expect(button).toContain("Bezig met laden")
    expect(button).not.toContain("Afronden")
  })

  it("is the step's own action once it is read", () => {
    const button = primary(shell({ pending: false, onPrimary: () => undefined }))
    expect(button).toContain("aria-busy=\"false\"")
    expect(button).not.toMatch(/ disabled=""/)
    expect(button).toContain("Afronden")
  })
})

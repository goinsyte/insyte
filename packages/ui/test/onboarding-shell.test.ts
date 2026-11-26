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
  optional?: boolean
  onSkip?: () => void
  skipLabel?: string
  content: null
}

let OnboardingShell: FunctionComponent<{
  persona: "admin"
  steps: Array<Step>
  stepIndex: number
  onBack: () => void
  canGoBack?: boolean
  onChangeRole: () => void
  onExit: () => void
}>

beforeAll(async () => {
  const specifier = "@insyte/ui/app/onboarding/onboarding-shell"
  OnboardingShell = ((await import(/* @vite-ignore */ specifier)) as { OnboardingShell: typeof OnboardingShell })
    .OnboardingShell
})

const shell = (step: Partial<Step>, at: { stepIndex?: number; canGoBack?: boolean } = {}) =>
  renderToStaticMarkup(
    createElement(OnboardingShell, {
      persona: "admin",
      steps: [
        { id: "plan", title: "Kies een abonnement om te proberen.", content: null },
        { id: "offline", title: "Terwijl je offline bent.", primaryLabel: "Afronden", content: null, ...step }
      ],
      stepIndex: at.stepIndex ?? 1,
      ...(at.canGoBack === undefined ? {} : { canGoBack: at.canGoBack }),
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

const buttons = (html: string) => [...html.matchAll(/<button[^>]*>(.*?)<\/button>/gs)].map((m) => m[0])
const back = (html: string) => buttons(html).find((b) => b.includes("Terug")) ?? ""
const named = (html: string, name: string) => buttons(html).filter((b) => b.replace(/<[^>]+>/g, "").trim() === name)

describe("the onboarding shell's other buttons", () => {
  it("offers one quieter way on, with its own label, beside the primary", () => {
    const html = shell({ primaryLabel: "Verder", skipLabel: "Nu overslaan", onSkip: () => undefined })
    expect(named(html, "Nu overslaan")).toHaveLength(1)
    expect(named(html, "Overslaan")).toHaveLength(0)
    expect(primary(html)).toContain("Verder")
  })

  it("offers no way on but the primary on a step that has none", () => {
    expect(named(shell({}), "Overslaan")).toHaveLength(0)
  })

  it("hides Terug where the host says the step before is done", () => {
    expect(back(shell({}))).not.toMatch(/ disabled=""/)
    expect(back(shell({}, { canGoBack: false }))).toMatch(/ disabled=""/)
  })
})

type SyncStep = (input: {
  connected: boolean
  rows: ReadonlyArray<never>
  canContinue: boolean
  onPrimary: () => void
  failed?: boolean
  onReconnect?: () => void
  onSkip?: () => void
}) => Step & { skipLabel?: string; onSkip?: () => void }

const wait = () => undefined
const reconnect = () => undefined
const skip = () => undefined

describe("the sync step", () => {
  let syncStep: SyncStep
  beforeAll(async () => {
    const specifier = "@insyte/ui/app/onboarding/sync-progress"
    syncStep = ((await import(/* @vite-ignore */ specifier)) as { syncStep: SyncStep }).syncStep
  })

  it("can be left while the import runs, to go on without it", () => {
    const step = syncStep({ connected: true, rows: [], canContinue: true, onPrimary: wait, onSkip: skip })
    expect(step.title).toBe("Alles wordt opgehaald.")
    expect(step.primaryLabel).toBe("Laat Insyte kijken")
    expect(step.skipLabel).toBe("Nu overslaan")
    expect(step.onSkip).toBe(skip)
  })

  it("says a failed import, and goes back to Shopify or on without it", () => {
    const step = syncStep({
      connected: true,
      rows: [],
      canContinue: true,
      onPrimary: wait,
      failed: true,
      onReconnect: reconnect,
      onSkip: skip
    })
    expect(step.title).toBe("De eerste import is mislukt.")
    expect(step.primaryLabel).toBe("Opnieuw koppelen")
    expect(step.onPrimary).toBe(reconnect)
    expect(step.skipLabel).toBe("Nu overslaan")
  })

  it("has nothing to wait for without a store", () => {
    const step = syncStep({ connected: false, rows: [], canContinue: true, onPrimary: wait, onSkip: skip })
    expect(step.title).toBe("Geen winkel, geen import.")
    expect(step.primaryLabel).toBe("Verder")
    expect(step.skipLabel).toBeUndefined()
  })
})

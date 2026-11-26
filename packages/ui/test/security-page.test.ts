import { createMemoryHistory, createRootRoute, createRouter, RouterContextProvider } from "@tanstack/react-router"
import { createElement, type FunctionComponent, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

/** `security-source.tsx`'s, restated in part: its own imports are the bundler's too. */
interface SecuritySource {
  twoFactor: boolean
  requireMfa: boolean
  googleSso: boolean
  sessions: ReadonlyArray<never>
  revoke: () => Promise<boolean>
  auditKept?: number | null
}

// Loaded the way `console-screens.test.ts` loads screens: the screens' own imports are written for the bundler.
const screen = "../src/app/settings/security-screen.tsx"
const sourceModule = "../src/app/settings/security-source.tsx"
const { SecurityPage } = (await import(/* @vite-ignore */ screen)) as { SecurityPage: FunctionComponent }
const { SecuritySourceProvider } = (await import(/* @vite-ignore */ sourceModule)) as {
  SecuritySourceProvider: FunctionComponent<{ value: SecuritySource; children: ReactNode }>
}

const router = createRouter({ routeTree: createRootRoute(), history: createMemoryHistory() })
const page = (patch: Partial<SecuritySource> = {}) =>
  renderToStaticMarkup(
    createElement(RouterContextProvider, {
      router,
      children: createElement(SecuritySourceProvider, {
        value: {
          twoFactor: false,
          requireMfa: false,
          googleSso: false,
          sessions: [],
          revoke: () => Promise.resolve(true),
          ...patch
        },
        children: createElement(SecurityPage)
      })
    })
  )

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()

/*
 * Beveiliging: each switch is named by its label for a screen reader, and the audit log says the period set under
 * Gegevens en privacy, with the way there, rather than a period of its own.
 */
describe("Beveiliging", () => {
  it("names each switch by its label", () => {
    const html = page()
    const switches = [...html.matchAll(/<button[^>]*role="switch"[^>]*>/g)].map((m) => m[0])
    expect(switches).toHaveLength(3)
    const names = switches.map((tag) => {
      const id = tag.match(/aria-labelledby="([^"]+)"/)?.[1]
      return id === undefined ? undefined : html.match(new RegExp(`id="${id}"[^>]*>([^<]+)<`))?.[1]
    })
    expect(names).toEqual(["Tweestapsverificatie", "2FA verplichten voor alle teamleden", "Google SSO"])
  })

  it("says how long the audit log is kept, as Gegevens en privacy has it", () => {
    expect(text(page({ auditKept: 12 }))).toContain("Bewaard: 1 jaar . Dat stel je in onder Gegevens en privacy .")
    expect(text(page({ auditKept: 6 }))).toContain("Bewaard: 6 maanden")
    expect(text(page({ auditKept: null }))).toContain("Bewaard: zonder einddatum")
    expect(page({ auditKept: 3 })).toContain("href=\"/settings/privacy\"")
    expect(page()).not.toContain("90 dagen")
  })

  it("only says where it is set while the period is not in", () => {
    expect(text(page())).toContain("Hoe lang het bewaard blijft, stel je in onder Gegevens en privacy .")
  })
})

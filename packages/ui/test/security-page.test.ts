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
 * Beveiliging: each switch is named by its label for a screen reader, and the audit log says what is true of it: it is
 * append-only and kept at least 13 months, whatever Gegevens en privacy says for Logboeken.
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

  it("says the audit log's floor, not a period of its own or the one under Gegevens en privacy", () => {
    const html = page()
    expect(text(html)).toContain(
      "Bewaard: minstens 13 maanden . Gegevens van een klant die om verwijdering vraagt, en van een definitief verwijderde leverancier, worden eruit gehaald."
    )
    expect(html).not.toContain("90 dagen")
    expect(html).not.toContain("/settings/privacy")
  })
})

import { createElement, type FunctionComponent } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

// Loaded the way `hero.test.ts` loads its screen: the screens' own imports are written for the bundler.
const screen = "../src/app/supplier/dashboard-screen.tsx"
const { SupplierGreeting } = (await import(/* @vite-ignore */ screen)) as {
  SupplierGreeting: FunctionComponent<{ firstName: string }>
}

/*
 * The supplier portal's greeting is the reader's clock, which the server does not have (React #418 after 22:00 in
 * Amsterdam: "Goedenavond" from the server's UTC, "Laat aan het werk" in the browser). The server's render, which is
 * also the browser's first, carries none of it (W13.6, as the affiliate portal and Start).
 */
describe("the supplier portal's greeting", () => {
  it("waits for hydration: the server sends no greeting", () => {
    const html = renderToStaticMarkup(createElement(SupplierGreeting, { firstName: "Sanne" }))
    expect(html).not.toMatch(/Sanne|Goede|wakker|Laat aan/i)
    expect(html).toContain("sup-title")
  })
})

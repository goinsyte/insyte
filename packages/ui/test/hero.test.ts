import { createElement, type FunctionComponent } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

// Loaded the way `console-screens.test.ts` loads screens: the screens' own imports are written for the bundler.
const view = "../src/app/dashboard/hero-view.tsx"
const { HeroView } = (await import(/* @vite-ignore */ view)) as {
  HeroView: FunctionComponent<{ name: string; needsYou: number }>
}

/*
 * Start's greeting is the reader's clock, which the server does not have (React #418: "Goedemorgen" from the server's
 * UTC, "Goedemiddag" in the browser). The server's render, which is also the browser's first, carries none of it.
 */
describe("Start's greeting", () => {
  it("waits for hydration: the server sends neither the greeting nor the date", () => {
    const html = renderToStaticMarkup(createElement(HeroView, { name: "Sanne de Vries", needsYou: 2 }))
    expect(html).not.toMatch(/Sanne|Goede|Zaterdag|Zondag|Maandag|vrijdag|wakker|Laat aan/i)
    expect(html).not.toMatch(/januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december/)
    expect(html).toContain("zaken wachten op jou")
  })
})

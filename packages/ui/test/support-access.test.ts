import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { SupportAccessCard } from "../src/app/settings/depth/support-access-card"
import { SupportBanner } from "../src/app/shell/support-banner"

/*
 * Insyte-support mag meekijken (M18): the line every member sees over the top bar while support looks along, and the
 * owner's card under Gegevens en privacy.
 */

const IN_A_DAY = new Date(Date.now() + 86_400_000).toISOString()

const card = (canChange: boolean, until: string | null) =>
  renderToStaticMarkup(
    createElement(SupportAccessCard, {
      support: { until, sessionEndsAt: null, days: 7, canChange, changing: false, setOn: () => undefined }
    })
  )

describe("Insyte-support looking along", () => {
  it("shows every member a line while it lasts, that it only reads", () => {
    const html = renderToStaticMarkup(createElement(SupportBanner, { endsAt: IN_A_DAY }))
    expect(html).toContain("Insyte-support kijkt mee")
    expect(html).toContain("alleen lezen")
    expect(html).toContain("role=\"status\"")
  })

  it("lets only the owner turn the consent on", () => {
    expect(card(true, null)).toContain("Uit.")
    expect(card(true, null)).toContain("na 7 dagen vanzelf uit")
    expect(card(false, null)).toContain("Alleen de eigenaar kan dit aan- of uitzetten")
    expect(card(true, IN_A_DAY)).toContain("Aan tot")
  })
})

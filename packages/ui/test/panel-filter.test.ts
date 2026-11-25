import { describe, expect, it } from "vitest"
import { filterSections } from "../src/app/lib/panel-filter.ts"
import { SETTINGS_KEYWORDS } from "../src/app/lib/settings-keywords.ts"

// Instellingen's panel as it is drawn: its sections and page names, with the keywords the panel gives each page.
const PAGES = {
  Algemeen: {
    "/settings/me": "Je profiel",
    "/settings/profile": "Account",
    "/settings/team": "Team",
    "/settings/roles": "Rollen",
    "/settings/regional": "Regio",
    "/settings/notifications": "Meldingen"
  },
  "Insyte AI": { "/settings/ai/limits": "Limieten", "/settings/ai/knowledge": "Kennisbank" },
  Technisch: { "/settings/security": "Beveiliging", "/settings/email-domain": "E-mail en domein" },
  Beheer: { "/settings/privacy": "Gegevens en privacy", "/settings/trash": "Prullenbak" }
} as const

const sections = Object.entries(PAGES).map(([label, pages]) => ({
  label,
  items: Object.entries(pages).map(([to, name]) => ({
    to,
    label: name,
    keywords: SETTINGS_KEYWORDS[to as keyof typeof SETTINGS_KEYWORDS]
  }))
}))
const found = (query: string) => filterSections(sections, query).flatMap((s) => s.items.map((i) => i.label))

describe("the settings panel's filter", () => {
  it("finds a page by its name, case and accents aside, from the start of a word", () => {
    expect(found("team")).toContain("Team")
    expect(found("rol")).toEqual(["Rollen"])
    expect(found("PRULLENBAK")).toEqual(["Prullenbak"])
    expect(found("gegevens en")).toEqual(["Gegevens en privacy"])
  })

  it("finds a page by a setting inside it", () => {
    expect(found("2fa")).toEqual(["Beveiliging"])
    expect(found("wachtwoord")).toEqual(["Beveiliging"])
    expect(found("stille uren")).toEqual(["Meldingen"])
    expect(found("csv")).toEqual(["Team"])
    expect(found("btw-nummer")).toEqual(["Account"])
    expect(found("meekijken")).toEqual(["Gegevens en privacy"])
    expect(found("support")).toEqual(["Gegevens en privacy"])
    expect(found("tijdzone")).toEqual(["Regio"])
    expect(found("naam")).toContain("Je profiel")
  })

  it("does not find a word inside another word", () => {
    // "ai" is the Insyte AI pages, not every page that mentions e-mail.
    expect(found("ai")).toEqual(["Limieten", "Kennisbank"])
  })

  it("keeps only the sections with a match, and none for what no page has", () => {
    expect(filterSections(sections, "2fa").map((s) => s.label)).toEqual(["Technisch"])
    expect(filterSections(sections, "xyzqq")).toEqual([])
    expect(filterSections(sections, "  ")).toEqual(sections)
  })
})

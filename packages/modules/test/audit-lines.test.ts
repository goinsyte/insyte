import { describe, expect, it } from "vitest"
import { changesOf, pageOf, pagesOf, sectionsOfPage, toCsv } from "../src/audit/domain/Audit.ts"

/*
 * The Logboek's lines (M17 step 20.1a): an audit row's diff read as "what it was, what it became", on the page the
 * change was made on, and the CSV the export writes.
 */

describe("changesOf", () => {
  it("reads a per-field diff in the page's order, with words for codes", () => {
    const lines = changesOf({
      section: "regional",
      action: "workspace.regional_updated",
      diff: { timeFormat: { from: "24h", to: "12h" }, language: { from: "nl-NL", to: "en-GB" } }
    })
    expect(lines).toEqual([
      { field: "Taal", before: "Nederlands", after: "Engels (VK)" },
      { field: "Tijdnotatie", before: "24-uurs", after: "12-uurs" }
    ])
  })

  it("reads a whole value with its unit", () => {
    expect(changesOf({ section: "retention", action: "workspace.retention_updated", diff: { from: 90, to: 365 } }))
      .toEqual([{ field: "Gegevens leesbaar houden voor", before: "90 dagen", after: "365 dagen" }])
  })

  it("reads an object's from/to field by field and skips the unchanged ones", () => {
    const lines = changesOf({
      section: "alerts",
      action: "workspace.alerts_updated",
      diff: { from: { delayHours: 24, disputeAmountMinor: 50000 }, to: { delayHours: 48, disputeAmountMinor: 50000 } }
    })
    expect(lines).toEqual([{ field: "Late bestelling", before: "24 uur", after: "48 uur" }])
  })

  it("reads a depth page's before/after, and says nothing as a dash", () => {
    expect(
      changesOf({ section: "shipping", action: "settings.shipping.freeFrom", diff: { before: null, after: true } })
    )
      .toEqual([{ field: "freeFrom", before: "—", after: "Aan" }])
  })

  it("names the change when the diff says nothing readable", () => {
    expect(changesOf({ section: "account", action: "workspace.updated", diff: null }))
      .toEqual([{ field: "Account", before: "—", after: "gewijzigd" }])
  })
})

describe("Je gegevens", () => {
  it("reads the automatic export's schedule as its words, on Je gegevens", () => {
    const row = { section: "data", action: "workspace.export_schedule_updated", diff: { from: "off", to: "weekly" } }
    expect(changesOf(row)).toEqual([{ field: "Automatisch exporteren", before: "Uit", after: "Elke week" }])
    expect(pageOf("data", row.action)).toEqual({ id: "data", label: "Je gegevens", path: "/settings/data" })
  })
})

describe("pages", () => {
  it("puts settings.retention on Gegevens en privacy, the older retention on Account", () => {
    expect(pageOf("retention", "settings.retention.days").id).toBe("privacy")
    expect(pageOf("retention", "workspace.retention_updated").id).toBe("account")
    expect(sectionsOfPage("privacy")).toEqual(["retention"])
  })

  it("lists each page once, by its Dutch name, and an unknown section under its own name", () => {
    const pages = pagesOf([
      { section: "regional", action: "workspace.regional_updated" },
      { section: "account", action: "workspace.updated" },
      { section: "alerts", action: "workspace.alerts_updated" },
      { section: "returns", action: "settings.returns.window" }
    ])
    expect(pages.map((p) => p.label)).toEqual(["Account", "Regio", "returns"])
    expect(pages.find((p) => p.id === "returns")?.path).toBe("")
  })
})

describe("toCsv", () => {
  it("writes the design's columns, in the workspace's time, quoting where it must", () => {
    const csv = toCsv([{
      id: "a:0",
      at: Date.UTC(2026, 10, 12, 12, 57),
      actor: { key: "member:m1", name: "Sam, de Vries" },
      page: "Regio",
      path: "/settings/regional",
      field: "Taal",
      before: "Nederlands",
      after: "Engels \"VK\""
    }], "Europe/Amsterdam")
    expect(csv).toBe(
      "Wanneer,Wie,Pagina,Wat,Was,Werd\r\n2026-11-12 13:57,\"Sam, de Vries\",Regio,Taal,Nederlands,\"Engels \"\"VK\"\"\"\r\n"
    )
  })
})

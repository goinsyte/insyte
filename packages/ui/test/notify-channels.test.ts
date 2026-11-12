import { createElement, type FunctionComponent } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

/** `notifications-source.tsx`'s, restated: its own imports are the bundler's too. */
interface PushHere {
  state: "unavailable" | "unsupported" | "blocked" | "off" | "on"
  devices: number
  busy: boolean
  enable: () => void
  disable: () => void
}
interface SlackHere {
  state: "unavailable" | "available" | "connected"
  team: string | null
  manage: boolean
  busy: boolean
  connect: () => void
  disconnect: () => void
}

// Loaded the way `console-screens.test.ts` loads screens: the screens' own imports are written for the bundler, not
// for this suite's type check.
const screen = "../src/app/settings/notifications-screen.tsx"
const { PushRow, SlackRow } = (await import(/* @vite-ignore */ screen)) as {
  PushRow: FunctionComponent<{ push: PushHere; testPush: (() => void) | undefined }>
  SlackRow: FunctionComponent<{
    slack: SlackHere
    channel: string
    channels: ReadonlyArray<{ value: string; label: string }>
    onChannel: (v: string) => void
  }>
}

/*
 * The Kanalen card where the host can deliver push and Slack (M11 step 13.5b): each state says what it is in Dutch,
 * a channel the environment lacks says "Nog niet beschikbaar", and only a manager gets to connect or let go of Slack.
 */

const noop = () => {}
const push = (patch: Partial<PushHere>): PushHere => ({
  state: "off",
  devices: 0,
  busy: false,
  enable: noop,
  disable: noop,
  ...patch
})
const slack = (patch: Partial<SlackHere>): SlackHere => ({
  state: "connected",
  team: "Northwind",
  manage: true,
  busy: false,
  connect: noop,
  disconnect: noop,
  ...patch
})

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
const pushRow = (p: Partial<PushHere>, testPush?: () => void) =>
  text(renderToStaticMarkup(createElement(PushRow, { push: push(p), testPush })))
const slackRow = (s: Partial<SlackHere>, channel = "") =>
  renderToStaticMarkup(createElement(SlackRow, {
    slack: slack(s),
    channel,
    channels: [{ value: "C0OPS", label: "#operations" }, { value: "dm", label: "Privébericht aan mij" }],
    onChannel: noop
  }))

describe("Mobiel push", () => {
  it("says what the environment and the browser cannot do", () => {
    expect(pushRow({ state: "unavailable" })).toContain("Nog niet beschikbaar")
    expect(pushRow({ state: "unsupported" })).toContain("Niet in deze browser")
    expect(pushRow({ state: "blocked" })).toContain("Geblokkeerd in deze browser")
  })

  it("offers to turn it on here, saying where else it is on", () => {
    expect(pushRow({ state: "off" })).toBe("Mobiel push Push aanzetten")
    expect(pushRow({ state: "off", devices: 2 })).toContain("Staat ook aan op 2 andere apparaten.")
  })

  it("tests and turns off a browser that has it, counting the others", () => {
    const on = pushRow({ state: "on", devices: 2 }, noop)
    expect(on).toContain("Testmelding sturen")
    expect(on).toContain("Uitzetten op dit apparaat")
    expect(on).toContain("Staat ook aan op 1 ander apparaat.")
    expect(pushRow({ state: "on", devices: 1 }, noop)).not.toContain("Staat ook aan")
  })
})

describe("Slack", () => {
  it("is not yet there without the environment's app, and a manager's to connect", () => {
    expect(text(slackRow({ state: "unavailable" }))).toContain("Nog niet beschikbaar")
    expect(text(slackRow({ state: "available" }))).toContain("Slack koppelen")
    const member = text(slackRow({ state: "available", manage: false }))
    expect(member).not.toContain("Slack koppelen")
    expect(member).toContain("Een eigenaar of beheerder koppelt Slack")
  })

  it("lists where messages go once connected, with a manager's way to let go", () => {
    const html = slackRow({}, "C0OPS")
    expect(text(html)).toContain("Gekoppeld met Northwind")
    expect(html).toMatch(/<option value="" ?>Kies een kanaal<\/option>/)
    expect(html).toContain(">#operations</option>")
    expect(html).toContain(">Privébericht aan mij</option>")
    expect(text(html)).toContain("Slack ontkoppelen")
    expect(text(slackRow({ manage: false }))).not.toContain("Slack ontkoppelen")
  })
})

import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { typing } from "../src/app/lib/typing.ts"

/*
 * The guard every shortcut on the window asks first (`g` then a key, `g` then `n`): a key press inside a field, an
 * editable cell, a sheet's grid, a dialog or a menu is the person's, not a shortcut. Targets here are stand-ins with
 * an element's three members; `inside` is the roles and attributes of the element and its ancestors.
 */
const target = (tagName: string, inside: ReadonlyArray<string> = [], isContentEditable = false) =>
  ({
    tagName,
    isContentEditable,
    closest: (selector: string) => selector.split(",").some((s) => inside.includes(s.trim())) ? {} : null
  }) as unknown as EventTarget

describe("a key press that belongs to what the person is in", () => {
  it("is a field's, an editable cell's, a grid's, a dialog's or a menu's", () => {
    expect(typing(target("INPUT"))).toBe(true)
    expect(typing(target("TEXTAREA"))).toBe(true)
    expect(typing(target("SELECT"))).toBe(true)
    expect(typing(target("DIV", [], true))).toBe(true)
    expect(typing(target("DIV", ["[role=grid]"]))).toBe(true)
    expect(typing(target("TD", ["[role=grid]"]))).toBe(true)
    expect(typing(target("BUTTON", ["[role=dialog]"]))).toBe(true)
    expect(typing(target("DIV", ["[role=menu]"]))).toBe(true)
  })

  it("is a shortcut's anywhere else, and on the window or the document", () => {
    expect(typing(target("BODY"))).toBe(false)
    expect(typing(target("BUTTON", ["[role=toolbar]"]))).toBe(false)
    expect(typing(null)).toBe(false)
    expect(typing({} as EventTarget)).toBe(false)
  })
})

describe("the shortcuts on the window", () => {
  it("ask the guard, so `g` then `n` in a sheet stays in the sheet", () => {
    const files = [
      "shell/goto-keys.tsx",
      "shell/notifications-inbox.tsx",
      "affiliates/affiliates-screen.tsx",
      "dashboard/queue-panel.tsx"
    ]
    for (const file of files) {
      const source = readFileSync(new URL(`../src/app/${file}`, import.meta.url), "utf8")
      expect(source, file).toMatch(/typing\(e\.target\)/)
    }
  })
})

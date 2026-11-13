import { createElement, type FunctionComponent, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

// Loaded the way `console-screens.test.ts` loads screens: the components' own imports are written for the bundler.
const dialog = "../src/app/common/form-dialog.tsx"
const bits = "../src/app/team/bits.tsx"
const { Field, TextField } = (await import(/* @vite-ignore */ dialog)) as {
  Field: FunctionComponent<{ label: string; children?: ReactNode }>
  TextField: FunctionComponent<{ value: string; onChange: (v: string) => void }>
}
const { Segmented } = (await import(/* @vite-ignore */ bits)) as {
  Segmented: FunctionComponent<{
    label: string
    value: string
    options: ReadonlyArray<{ id: string; label: string }>
    onChange: (v: string) => void
  }>
}

const noop = () => {}
const html = (node: ReactNode) => renderToStaticMarkup(node as never)

/*
 * A <label> names the first button inside it, so a Field around a Segmented gave its first radio the label's text on
 * top of its own: "Soort Soort". A control that names itself (a radiogroup) sits in the same box, not in a label.
 */
describe("Field", () => {
  it("is not a <label> around a radiogroup, which names itself", () => {
    const out = html(
      createElement(
        Field,
        { label: "Soort" },
        createElement(Segmented, {
          label: "Soort",
          value: "fixed",
          options: [{ id: "fixed", label: "Vast" }, { id: "percent", label: "Percentage" }],
          onChange: noop
        })
      )
    )
    expect(out).not.toContain("<label")
    expect(out).toContain(`<div class="flex flex-col gap-1.5">`)
    expect(out).toContain(`role="radiogroup" aria-label="Soort"`)
    expect(out.match(/Soort/g)).toHaveLength(2)
  })

  it("is not a <label> around a hand-written radiogroup either", () => {
    const out = html(
      createElement(
        Field,
        { label: "Vervoerder" },
        createElement("div", { role: "radiogroup", "aria-label": "Vervoerder" })
      )
    )
    expect(out).not.toContain("<label")
  })

  it("stays the <label> of an input, which it names", () => {
    const out = html(createElement(Field, { label: "Naam" }, createElement(TextField, { value: "", onChange: noop })))
    expect(out).toMatch(/^<label class="flex flex-col gap-1.5">/)
  })
})

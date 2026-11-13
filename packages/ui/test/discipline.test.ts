import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

/**
 * The rules this package is held to, checked mechanically rather than by eye.
 *
 * The legacy marketing site is why these exist as tests and not as prose. Its `DESIGN.md` stated
 * most of them, in 756 lines nothing could run, and the components broke them 454 times for
 * `font-mono` alone. A rule a grep can check is worth more than a rule a reviewer must remember.
 *
 * They apply to code AUTHORED here. The ported files are excluded by `ported()` below — holding
 * reproduced code to rules it was never written under would mean editing it, which is the one thing
 * a port may not do. `src/marketing/` used to be one of them; since the landing page was redesigned
 * on the tokens (28 October 2026) it is authored code and these rules hold it like the rest.
 */

const src = fileURLToPath(new URL("../src", import.meta.url))

function sources(dir: string): Array<readonly [string, string]> {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) return []
    return [[path.slice(src.length + 1), readFileSync(path, "utf8")] as const]
  })
}

/**
 * The ported files — the mark library and the contact address — are verbatim copies, so the rules
 * below do not apply to them. (The three legacy components went with the old brand book.)
 *
 * `components/` used to be on this list and is not any more. The twenty-four primitives in it were
 * generated here from the shadcn registry and then rewritten onto Base UI, so they are this repo's
 * own code: dprint formats them, and holding the rest of the package to a rule while the layer
 * every screen renders is exempt from it is how the rule rots. Flipping it cost two edits: the
 * `rounded-xs` close buttons in `dialog.tsx` and `sheet.tsx`, both resolving to a 2px Tailwind
 * default the ladder never chose.
 *
 * The brand book (`brand/book/`) is NOT on the list. It was a verbatim port until 1 November 2026,
 * when it was rebuilt on the tokens (ADR-0026's addendum); it is authored code now and every rule
 * below holds it. `brand/mark.tsx` and `brand/marks.tsx` stay: the product renders that mark as
 * ported, and changing it is an open decision, not a side effect.
 */
const portedPaths = [
  "brand/mark.tsx",
  "brand/marks.tsx",
  "lib/contact-email.tsx",
  /*
   * Moved here by ADR-0026, with the exemption they had where they were. The console's screens were
   * outside this test's reach in `apps/console`, held to their own rules, and moving them was not an
   * occasion to edit them. `data-source/types.ts` is their record types, lifted out verbatim.
   */
  "app/",
  "data-source/types.ts"
]

/**
 * Screens that graduated from the port (M7.6): their commands run on the server now, they were edited for it, and the
 * rules hold them like any authored code. A screen joins this list when its slice's commands land.
 */
const graduated = [
  "app/orders/",
  "app/products/",
  "app/customers/",
  "app/suppliers/",
  "app/returns/",
  "app/quality/",
  "app/dashboard/",
  "app/stores/home-store.ts",
  "app/settings/notifications-screen.tsx",
  "app/settings/notifications-source.tsx",
  "app/settings/notifications-demo-source.tsx",
  "app/settings/depth/log-screen.tsx",
  "app/settings/depth/trash-screen.tsx",
  "app/settings/log-source.tsx",
  "app/settings/log-demo-source.tsx",
  "app/settings/trash-source.tsx",
  "app/settings/trash-demo-source.tsx",
  "app/lib/home/day.ts",
  "app/lib/home/kinds.ts",
  "app/analytics/",
  "app/chats/",
  "app/inbox/",
  "app/chargebacks/",
  "app/automations/",
  "app/costs/",
  "app/settings/depth/",
  "app/settings/webhooks-screen.tsx",
  "app/settings/webhooks-page.tsx",
  "app/developer/webhook-dialog.tsx",
  "app/developer/delivery-drawer.tsx",
  "app/developer/webhooks-source.tsx",
  "app/developer/webhooks-demo-source.tsx",
  "app/lib/webhooks-core.ts",
  "app/courses/",
  "app/lib/courses.ts",
  "app/stores/courses-store.ts",
  "app/marketplace/",
  "app/settings/apps-screen.tsx",
  "app/live/"
]

/**
 * Inside a graduated directory but not yet edited for the backend: the queue panel waits for the proposals branches,
 * E-mail en domein for the sending domain (20.1c); the Marketplace's modal and its brand logos are drawn as ported
 * (M17 step 3 changed only what they read).
 */
const notYet = new Set([
  "app/dashboard/queue-panel.tsx",
  "app/settings/depth/email-domain-screen.tsx",
  "app/marketplace/marketplace-modal.tsx",
  "app/marketplace/brand-logos.tsx"
])

const ported = (name: string): boolean =>
  portedPaths.some((prefix) => name.startsWith(prefix)) &&
  (notYet.has(name) || !graduated.some((prefix) => name.startsWith(prefix)))

const files = sources(src).filter(([name]) => !ported(name))

/**
 * The string literals in a source, which is where a Tailwind class can actually be.
 *
 * A regex over the whole file is a check with false positives, and the first thing anyone does with
 * one of those is delete it: this suite's first run failed on the word `rounded-control` inside a
 * comment explaining why that utility does not exist. A regex over quotes alone is no better, because
 * prose marks code with backticks. So this is a scanner — it skips comments, then returns what the
 * quotes hold. Over-inclusive by design on a template literal's interpolations, which is the safe
 * direction for a check whose failure mode should be a false alarm and never a miss.
 */
function literals(source: string): string {
  const found: Array<string> = []
  let i = 0
  while (i < source.length) {
    const here = source.charAt(i)
    const next = source.charAt(i + 1)
    if (here === "/" && next === "/") {
      while (i < source.length && source.charAt(i) !== "\n") i++
      continue
    }
    if (here === "/" && next === "*") {
      i += 2
      while (i < source.length && !(source.charAt(i) === "*" && source.charAt(i + 1) === "/")) i++
      i += 2
      continue
    }
    if (here === "\"" || here === "'" || here === "`") {
      i++
      let held = ""
      while (i < source.length && source.charAt(i) !== here) {
        if (source.charAt(i) === "\\") {
          i += 2
          continue
        }
        held += source.charAt(i)
        i++
      }
      i++
      found.push(held)
      continue
    }
    i++
  }
  return found.join("\n")
}

const classes = files.map(([name, source]) => [name, literals(source)] as const)

describe("the components read the token system rather than restating it", () => {
  it("has files to check at all, so a silent empty pass is impossible", () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it("names no colour literally", () => {
    // Every colour reaches a component through a slot utility (`bg-primary`, `text-ink-3`), so a hex
    // or an `oklch(...)` in here is a value that the gamut and contrast gates never see.
    for (const [name, source] of classes) {
      // A run of digits after `#` is how the product writes a record ("Ticket #5142", "order #2049"),
      // so a hex colour must carry at least one letter to count — the landing page shows records.
      expect(source, `${name} names a colour literally`).not.toMatch(
        /#(?![0-9]+\b)[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab)\(/
      )
    }
  })

  it("uses one radius ladder", () => {
    // The tokens render `sm`/`md`/`lg`/`xl` onto the five roles. `rounded-2xl` and up still resolve,
    // from Tailwind's own defaults, to sizes this system never chose — and the uniform `rounded-2xl`
    // card grid is on PRODUCT.md's anti-reference list by name.
    const ladder = new Set(["sm", "md", "lg", "xl", "full", "none"])
    for (const [name, source] of classes) {
      for (const match of source.matchAll(/\brounded(?:-[a-z]+)?-([a-z0-9]+)\b/g)) {
        expect(ladder, `${name} uses rounded-${match[1]}, which is outside the ladder`).toContain(match[1])
      }
    }
  })

  it("keeps monospace for figures, and names every file that gets to", () => {
    /*
     * The rule is that mono carries figures a reader might compare or copy. The brand kit is figures
     * — hex values, contrast ratios, pixel sizes, bezier coefficients — so it is on the list, and
     * everywhere else the budget is zero. Adding a file here is a deliberate edit, which is the
     * point: the legacy site's 454 usages came from a rule that applied to eyebrows by default.
     */
    const figures = new Set([
      // The kit's page (`/brand/tokens`, once `apps/brand/src/brand.tsx`): it names the token
      // source file in mono, beside the four specimen sheets below.
      "brand/kit.tsx",
      "brand/colour.tsx",
      "brand/motion.tsx",
      "brand/shape.tsx",
      "brand/type.tsx",
      // A supplier's API secret, shown once to be copied character for character (M8.2).
      "app/suppliers/suppliers-screen.tsx"
    ])

    for (const [name, source] of classes) {
      if (figures.has(name)) continue
      expect(source, `${name} sets font-mono`).not.toMatch(/\bfont-mono\b/)
    }

    // An allowlist entry matching nothing is how an allowlist outlives the rule it was an exception
    // to, so the list is checked against the tree as well.
    for (const name of figures) {
      expect(files.map(([file]) => file), `${name} is on the mono list but not in the package`).toContain(name)
    }
  })

  it("carries no `dark:` variant, because the tokens already carry the night", () => {
    // There IS a dark theme now — `app.css` declares `@custom-variant dark` and the tokens render a
    // key-for-key night map under `.dark`. That is exactly why a component may not write `dark:`:
    // the surface it names is already the right colour in both themes, and a `dark:` override is a
    // second opinion that the gamut and contrast gates never see.
    for (const [name, source] of classes) {
      expect(source, `${name} has a dark: variant that can never match`).not.toMatch(/\bdark:/)
    }
  })
})

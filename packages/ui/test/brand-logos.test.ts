import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { initials } from "../src/app/lib/format.ts"

/*
 * `BrandLogo` asks for `/logos/<file>` on whatever app serves the page. The console serves its own `public/`, so a
 * file the map names but the console does not ship is a broken image on every screen that names that service. The
 * map is read from the source, as `discipline.test.ts` reads its rules: the component is a `.tsx` with extensionless
 * imports, which this project does not load.
 */

const LOGOS = new URL("../../../apps/console/public/logos/", import.meta.url).pathname
// The record of where each file came from, beside `public/` rather than in it, so it is not served.
const RECORD = new URL("../../../apps/console/logos-BRON.md", import.meta.url).pathname
const source = readFileSync(new URL("../src/app/marketplace/brand-logos.tsx", import.meta.url), "utf8")
const files = [...source.matchAll(/\bfile: "([^"]+)"/g)].map((m) => m[1]!)

describe("the console's logo files", () => {
  it("reads the map", () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it("serves no record with them", () => {
    expect(existsSync(`${LOGOS}BRON.md`)).toBe(false)
  })

  it("ships every file BrandLogo names", () => {
    expect(files.filter((file) => !existsSync(`${LOGOS}${file}`))).toEqual([])
  })

  it("records the source of every file it ships", () => {
    const sources = readFileSync(RECORD, "utf8")
    expect(files.filter((file) => !sources.includes(`\`${file}\``))).toEqual([])
  })
})

describe("initials, the tile without a logo", () => {
  it("takes the first letter of each word, two at most", () => {
    expect(initials("Yotpo Reviews")).toBe("YR")
    expect(initials("Zapier")).toBe("Z")
    expect(initials("Bank transfer met iDEAL")).toBe("BT")
  })

  it("keeps a leading number whole", () => {
    expect(initials("17TRACK")).toBe("17")
    expect(initials("17 Track")).toBe("17")
  })
})

import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/*
 * Every `@insyte/ui` module a console route imports loads with no data source installed. The console installs none
 * (ADR-0034), so a read of the seam while a module loads throws there before anything renders, as `lib/api.ts`'s sorted
 * orders and the demo auth stub's session did. The list is read from the routes, so a route that starts mounting a
 * screen is covered by the same test.
 */

const ROUTES = new URL("../../../apps/console/src/routes/", import.meta.url).pathname

const filesUnder = (dir: string): Array<string> =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    return statSync(path).isDirectory() ? filesUnder(path) : /\.tsx?$/.test(entry) ? [path] : []
  })

// A fresh array, so sorting it in place changes nothing else (`toSorted` is past this project's `lib`).
// oxlint-disable-next-line unicorn/no-array-sort
const uiModules = [
  ...new Set(
    filesUnder(ROUTES).flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/from\s+"(@insyte\/ui\/app\/[^"]+)"/g)].map((m) => m[1]!)
    )
  )
].sort()

describe("the screens the console mounts", () => {
  it("are found in its routes", () => {
    expect(uiModules).toContain("@insyte/ui/app/auth/login-screen")
  })

  it.each(uiModules)("%s loads with no data source installed", async (specifier) => {
    await expect(import(/* @vite-ignore */ specifier)).resolves.toBeDefined()
  })
})

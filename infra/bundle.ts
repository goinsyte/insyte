import { getCompatibility, getToolingCompatibility } from "@alchemy.run/cloudflare/Workers/Compatibility"
import { WorkerBundle } from "@alchemy.run/cloudflare/Workers/Sources/Rolldown"
import { BunServices } from "@effect/platform-bun"
import { Effect } from "effect"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { type WorkerName, WORKERS } from "./workers.ts"

/*
 * A Worker bundled the way `alchemy deploy` bundles it, written to a folder, for the startup check
 * (`scripts/startup-check.ts`). It calls alchemy's own bundler (`WorkerBundle`, rolldown with alchemy's options and
 * the Cloudflare plugins) with the props `app.ts` deploys (`workers.ts`), so nothing here restates alchemy's build.
 * Nothing is deployed and no credentials are read.
 */

export interface BuiltWorker {
  /** The entry module, relative to the folder. */
  readonly main: string
  /** The compatibility the deployed script gets, after alchemy's defaults. */
  readonly compatibility: { readonly date: string; readonly flags: ReadonlyArray<string> }
}

export const bundleWorker = (name: WorkerName, outDir: string): Promise<BuiltWorker> => {
  const worker = WORKERS[name]
  const main = resolve(import.meta.dirname, worker.main)
  const props = { main, isExternal: true, compatibility: worker.compatibility }
  const compatibility = getCompatibility(props)
  return Effect.gen(function*() {
    const bundler = yield* WorkerBundle
    const { files } = yield* bundler.build({
      id: name,
      main,
      compatibility: getToolingCompatibility(compatibility, main),
      // A plain module Worker, as `app.ts` declares it (no Effect implementation): no virtual entry.
      entry: { kind: "external" },
      stack: { name: "insyte", stage: "startup-check" },
      extraOptions: undefined
    })
    rmSync(outDir, { recursive: true, force: true })
    for (const file of files) {
      const target = join(outDir, file.path)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, file.content)
    }
    return { main: files[0].path, compatibility }
  }).pipe(Effect.provide(BunServices.layer), Effect.runPromise)
}

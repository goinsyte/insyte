import * as Cloudflare from "@alchemy.run/cloudflare"
import * as Neon from "@alchemy.run/neon"
import * as Alchemy from "alchemy"
import { Config, Effect, Layer } from "effect"

/*
 * What every preview's database starts from (M1.5, 14 §2): `preview-base`, a schema-only copy of nonprod `main`, so it
 * holds staging's schema and none of staging's rows. CI keeps it current (`scripts/preview-base.ts`): staging's run
 * migrates and seeds it with the three scenario workspaces; each `pr-<n>` branch (`app.ts`) forks it with that data.
 *
 * Its own stack, deployed as stage `nonprod` by the preview job: `shared.ts` also runs where NEON_PROJECT_ID is the
 * production project, and a preview's `alchemy destroy` must never reach the branch every preview forks. Not protected:
 * Neon resets role passwords on branches forked from a protected one, which would lock the previews out.
 */
export default Alchemy.Stack(
  "insyte-previews",
  { providers: Neon.providers().pipe(Layer.provideMerge(Cloudflare.providers())), state: Cloudflare.state() },
  Effect.gen(function*() {
    const base = yield* Neon.Branch("PreviewBase", {
      project: { projectId: yield* Config.String("NEON_PROJECT_ID") },
      name: "preview-base",
      parentBranch: { name: "main" },
      initSource: "schema-only"
    })
    return { branch: base.branchId, host: base.origin.host }
  })
)

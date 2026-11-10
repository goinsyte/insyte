import * as Cloudflare from "@alchemy.run/cloudflare"
import * as Neon from "@alchemy.run/neon"
import * as Alchemy from "alchemy"
import { Effect, Layer } from "effect"
import { STAGES } from "./stages.ts"

/*
 * What every preview's database starts from (M1.5, 14 §2): `preview-base`, forked once from nonprod `main` and then
 * emptied of every row but the migration ledger and seeded with the three scenario workspaces (`scripts/preview-base.ts`
 * on its first run). From there it only moves forward: staging's run applies staging's migrations and reseeds it, and it
 * is never copied from `main` again, so staging's rows do not come back. Each `pr-<n>` branch (`app.ts`) forks it.
 *
 * A plain fork, not Neon's schema-only branch: that one recreates every object as `neondb_owner`, so `insyte_owner` owns
 * nothing it migrates and the relay's security-definer functions run as a role the outbox policy does not name.
 *
 * Its own stack, deployed as stage `nonprod` by the preview job, so a preview's `alchemy destroy` never reaches the
 * branch every preview forks. Not protected:
 * Neon resets role passwords on branches forked from a protected one, which would lock the previews out.
 */
export default Alchemy.Stack(
  "insyte-previews",
  { providers: Neon.providers().pipe(Layer.provideMerge(Cloudflare.providers())), state: Cloudflare.state() },
  Effect.gen(function*() {
    const base = yield* Neon.Branch("PreviewBase", {
      project: { projectId: STAGES.preview.neonProjectId },
      name: "preview-base",
      parentBranch: { name: "main" }
    })
    return { branch: base.branchId, host: base.origin.host }
  })
)

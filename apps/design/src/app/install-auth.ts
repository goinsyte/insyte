/**
 * The second half of this host's composition root: the demo's auth client, which reads the data source as it loads.
 * `boot.tsx` imports it first, so it runs after `install.ts` has installed the fixtures (see `demo-auth.ts`).
 */
import { installAuthClient } from "@insyte/ui/app/lib/auth-client"
import { demoAuthClient } from "./demo-auth.ts"

installAuthClient(demoAuthClient)

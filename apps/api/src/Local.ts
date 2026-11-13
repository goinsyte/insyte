import jobs from "./Jobs.ts"
import api from "./Main.ts"
import type { Env } from "./platform/Env.ts"
import type { IngestMessage } from "./platform/Ingest.ts"
import type { EventsMessage } from "./platform/Relay.ts"
import { email } from "./transports/email/Email.ts"
// Loaded up front here: the deployed API loads the `__dev` routes on first use (`DevRoutes.ts`), and in the worker
// tests a load still under way when a test file ends fails the run ("Closing rpc while resolve was pending").
// oxlint-disable-next-line import/no-unassigned-import
import "./transports/http/dev/Routes.ts"

/*
 * Both Workers as one, for `wrangler dev` and the worker tests (`wrangler.jsonc`): the API's routes, the jobs Worker's
 * queue consumers, cron and Workflows, and every Durable Object, in one script, as before ADR-0041 split them. Deployed
 * stages run `Main.ts` and `Jobs.ts` apart (`infra/app.ts`).
 */

export * from "./Jobs.ts"
export * from "./Main.ts"

export default { ...api, ...jobs, email } satisfies ExportedHandler<Env, EventsMessage | IngestMessage>

import { statements } from "../statements.ts"

/*
 * A ticket made from a website chat (M15 step 8) names where it came from: `webchat`, beside 0050's mail sources.
 * Additive only: every source 0050 allowed stays allowed.
 */

export default statements(
  "alter table tickets drop constraint tickets_source_check",
  `alter table tickets add constraint tickets_source_check
     check (source in ('gmail', 'outlook', 'email', 'shopify', 'klarna', 'chat', 'insyte', 'manual', 'supplier',
                       'webchat'))`
)

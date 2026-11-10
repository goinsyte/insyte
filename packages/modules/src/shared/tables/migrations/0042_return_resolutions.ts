import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * Returns settled in Shopify, Shopify's own returns, and the shopper's mails (M9.3). `returns.resolution_shopify` is
 * what a resolution made in Shopify once its undo window had passed: asked for, made (the gift card, the code, the new
 * order) or failed with why (a scope the store has not granted is its own reason, so the console can say what to do).
 * A return opened in Shopify is mirrored once per Shopify return (`returns_shopify`). `return_mails` keeps which mail
 * of a return went, so a relay that delivers twice mails once. The capture adapter keeps a mail's reference and sender
 * too, so a test finds one return's mails among every run's.
 */
export default statements(
  "alter table returns add column resolution_shopify jsonb",
  "create unique index returns_shopify on returns (store_id, shopify_return_id) where shopify_return_id is not null",
  `create table return_mails (
     workspace_id text not null references workspaces(id) on delete cascade,
     return_id    text not null references returns(id) on delete cascade,
     kind         text not null check (kind in ('received', 'approved', 'rejected', 'label', 'resolved')),
     sent_at      timestamptz not null default now(),
     primary key (return_id, kind)
   )`,
  tenantTable("return_mails", { membersOnly: true }),
  "alter table captured_mail add column reference text",
  "alter table captured_mail add column sender text",
  "create index captured_mail_reference on captured_mail (reference) where reference is not null"
)

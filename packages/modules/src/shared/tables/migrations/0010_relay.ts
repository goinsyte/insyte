import { statements } from "../statements.ts"

/**
 * The outbox relay's way across workspaces (M1.4, 06 §6). Neither role bypasses RLS, so a security-definer function is
 * filtered like anything else; this policy applies to `insyte_owner` alone, the definer, so `outbox_due` sees every
 * workspace's due rows and returns their ids and workspaces, nothing of their content. `insyte_app` may call it, and
 * still reads no other workspace's rows itself.
 *
 * `captured_product_events`: what the product-analytics sink would have sent while the stage has no PostHog key, as
 * `captured_mail` is for mail. Locally, in the worker tests and on previews; never written where PostHog is configured.
 */
export default statements(
  "create policy outbox_relay on outbox as permissive for all to insyte_owner using (true) with check (true)",
  `create function outbox_due(lim int) returns table (id text, workspace_id text)
     language sql security definer set search_path = public as $$
       select id, workspace_id from outbox
       where relayed_at is null and cancelled_at is null and coalesce(not_before, created_at) <= now()
       order by created_at limit least(lim, 500)
       for update skip locked
     $$`,
  "revoke all on function outbox_due(int) from public",
  "grant execute on function outbox_due(int) to insyte_app",
  // Which workspace each kicked id belongs to, so the consumer can open that workspace's scope; ids only.
  `create function outbox_workspaces(ids text[]) returns table (id text, workspace_id text)
     language sql security definer set search_path = public as $$
       select id, workspace_id from outbox where id = any(ids)
     $$`,
  "revoke all on function outbox_workspaces(text[]) from public",
  "grant execute on function outbox_workspaces(text[]) to insyte_app",
  //
  `create table captured_product_events (
     id           bigint generated always as identity primary key,
     outbox_id    text not null,
     event        text not null,
     distinct_id  text not null,
     groups       jsonb not null default '{}',
     properties   jsonb not null default '{}',
     captured_at  timestamptz not null default now()
   )`,
  "create index captured_product_events_outbox on captured_product_events (outbox_id)"
)

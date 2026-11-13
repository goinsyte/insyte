import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * Live (M14 step 3; domain.md §3.3, §10.3): which stores have the Insyte Web Pixel, and the key it posts with.
 *
 * - `store_pixels`: one row per store whose pixel was installed from Instellingen → Winkels. The ingest key itself is
 *   never kept, only its keyed hash (`ingest_key_hash`, the server's HMAC): the pixel carries the key in its Shopify
 *   settings, and a repair makes a new one. The key is a public identifier, not a secret: Shopify hands pixel settings
 *   to the visitor's browser. It says which store an event is for and lets a repair cut off an old pixel; the ingest's
 *   limits and the room's caps are what bound forged traffic. `origins` are the storefront origins the pixel's requests
 *   may come from (the shop's primary domain and its myshopify domain, read from Shopify at install). `last_event_at`
 *   is the one thing the pixel's traffic writes, at most once a minute: whether the store's Live view works.
 * - An install writes the new key's hash to `pending_key_hash` before the key goes to Shopify, and promotes it once
 *   Shopify has it, so a request that dies in between leaves a pixel whose key still works. `installing_until` is the
 *   install's lease: one install per store at a time. `installed_at` is set when the first install completes.
 * - Visitors are never rows. The ingest hands each event to the workspace's `LiveRoomDurableObject`, in memory only.
 * - `route_pixel(store)`: the public ingest's read before it knows the workspace, ids and the hash only, for a connected
 *   store. `pixel_seen(store)`: its one write.
 */
export default statements(
  `create table store_pixels (
     store_id             text primary key references stores(id) on delete cascade,
     workspace_id         text not null references workspaces(id) on delete cascade,
     shopify_web_pixel_id text,
     ingest_key_hash      text,
     pending_key_hash     text,
     installing_until     timestamptz,
     origins              text[] not null default '{}',
     installed_at         timestamptz,
     installed_by         text,
     last_event_at        timestamptz
   )`,
  "create index store_pixels_workspace on store_pixels (workspace_id)",
  tenantTable("store_pixels", { membersOnly: true }),
  // The routing functions read and touch across workspaces as their owner (row level security is forced, owner included).
  "create policy store_pixels_routing on store_pixels as permissive for select to insyte_owner using (true)",
  "create policy store_pixels_seen on store_pixels as permissive for update to insyte_owner using (true)",
  `create function route_pixel(store text)
     returns table (workspace_id text, ingest_key_hash text, pending_key_hash text, origins text[])
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       return query select p.workspace_id, p.ingest_key_hash, p.pending_key_hash, p.origins from store_pixels p
                    join stores s on s.id = p.store_id
                    where p.store_id = store and s.status = 'connected'
                      and (p.ingest_key_hash is not null or p.pending_key_hash is not null);
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function route_pixel(text) from public",
  "grant execute on function route_pixel(text) to insyte_app",
  `create function pixel_seen(store text) returns void
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       update store_pixels set last_event_at = now()
        where store_id = store and (last_event_at is null or last_event_at < now() - interval '1 minute');
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function pixel_seen(text) from public",
  "grant execute on function pixel_seen(text) to insyte_app"
)

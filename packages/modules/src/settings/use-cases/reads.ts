import { Db } from "@insyte/database/Db"
import { Invalid } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import { FileStore } from "../../shared/domain/Documents.ts"
import {
  LINK_KEYS,
  LINK_VARIABLES,
  type LinkUsage,
  LOGO_BYTES,
  LOGO_MIMES,
  SHIP_STATUS_IDS,
  type StatusCounts,
  type UploadLogo
} from "../domain/Settings.ts"

/*
 * What the settings pages read beside their section (M17 step 20.1b): Verzending's "Nu" column, how many reply templates
 * use each of Sjablonen' links, and Huisstijl's logo kept as one of the workspace's files.
 */

/**
 * Orders in each carrier status now (widgets/05 §7.1): each order shipped in the last 30 days by its newest parcel,
 * AfterShip's word once it has one and Shopify's until then, and the orders at a supplier that are not shipped yet.
 * Insyte does not tell "onderweg naar het land", "bij de lokale vervoerder", "klaar om op te halen" and "bezorging
 * mislukt" apart from the statuses around them yet (AfterShip's subtags); those count none.
 */
export const statusCounts = Effect.fn("Shipping.statusCounts")(function*() {
  yield* Policy.require("settings", 1)
  const db = yield* Db
  const rows = yield* db.scoped((sql) =>
    sql<{ status: string; n: number }>`
      with parcels as (
        select distinct on (f.order_id) f.order_id, d.status as tracked, f.tracking_status as shopify
        from fulfilments f
        join orders o on o.id = f.order_id
        left join deliveries d on d.fulfilment_id = f.id
        where o.cancelled_at is null and coalesce(f.shipped_at, o.shipped_at, o.placed_at) > now() - interval '30 days'
        order by f.order_id, f.shipped_at desc nulls last, f.id desc
      ), worded as (
        select case coalesce(nullif(tracked, 'pending'), shopify)
                 when 'delivered' then 'delivered'
                 when 'out_for_delivery' then 'out'
                 when 'exception' then 'exception'
                 when 'returned' then 'exception'
                 when 'expired' then 'stale'
                 when 'in_transit' then 'transit'
                 else case when tracked = 'pending' then 'noinfo' else 'info' end
               end as status
        from parcels
        union all
        select 'supplier' from orders o
        where o.status = 'at_supplier' and o.cancelled_at is null
          and not exists (select 1 from fulfilments f where f.order_id = o.id)
      )
      select status, count(*)::int as n from worded group by status`
  )
  const counts: Record<string, number> = Object.fromEntries(SHIP_STATUS_IDS.map((id) => [id, 0]))
  for (const r of rows) counts[r.status] = r.n
  return counts as StatusCounts
})

/** How many of the workspace's reply templates (`ticket_templates`) carry each link's variable. */
export const linkUsage = Effect.fn("Templates.linkUsage")(function*() {
  yield* Policy.require("settings", 1)
  const db = yield* Db
  const [row] = yield* db.scoped((sql) =>
    sql<LinkUsage>`
      select count(*) filter (where position(${LINK_VARIABLES.review} in t.title || ' ' || t.description) > 0)::int
               as review,
             count(*) filter (where position(${LINK_VARIABLES.unsubscribe} in t.title || ' ' || t.description) > 0)::int
               as unsubscribe,
             count(*) filter (where position(${LINK_VARIABLES.restock} in t.title || ' ' || t.description) > 0)::int
               as restock
      from ticket_templates t where t.deleted_at is null`
  )
  return Object.fromEntries(LINK_KEYS.map((k) => [k, row?.[k] ?? 0])) as LinkUsage
})

const decode = (data: string): Uint8Array | undefined => {
  try {
    return Uint8Array.from(atob(data.replace(/^data:[^,]*,/, "")), (c) => c.charCodeAt(0))
  } catch {
    return undefined
  }
}

/**
 * Huisstijl's "Kiezen": the logo kept as a file of the workspace (`kind = logo`), not yet in use; saving the section
 * with its id puts it on the mails, the chat and the returns portal. A PNG, JPG, WebP or SVG up to 400 kB.
 */
export const uploadLogo = Effect.fn("Brand.uploadLogo")(function*(input: UploadLogo) {
  yield* Policy.require("settings", 2)
  if (!(LOGO_MIMES as ReadonlyArray<string>).includes(input.mime)) {
    return yield* new Invalid({ fields: { logo: "mime" } })
  }
  const bytes = decode(input.data)
  if (bytes === undefined || bytes.length === 0) return yield* new Invalid({ fields: { logo: "invalid" } })
  if (bytes.length > LOGO_BYTES) return yield* new Invalid({ fields: { logo: "too_large" } })
  const principal = yield* CurrentPrincipal
  const fileId = mintId("fil")
  const key = `${principal.workspaceId}/logos/${fileId}`
  yield* Effect.flatMap(Effect.service(FileStore), (s) => s.put(key, bytes, input.mime)).pipe(Effect.orDie)
  const name = input.name.replace(/["\\\r\n]/g, "").slice(0, 120) || "logo"
  const db = yield* Db
  yield* db.scoped((sql) =>
    sql`insert into files (id, workspace_id, r2_key, name, mime, size_bytes, kind, owner_type, owner_id, uploaded_by,
                           scan_state)
        values (${fileId}, ${principal.workspaceId}, ${key}, ${name}, ${input.mime}, ${bytes.length}, 'logo', 'brand',
                ${principal.workspaceId}, ${principal.id}, 'pending')`
  )
  return { fileId, url: `/api/files/${fileId}` }
})

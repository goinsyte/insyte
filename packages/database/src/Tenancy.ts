/*
 * The tenant tables and their policy (06 §1). Every table with a `workspace_id` that a request reads is here, and
 * gets its policy from `tenantTable`, never by hand: two locks, the static predicate check (boundaries) and forced
 * row level security, so a statement that forgets its `workspace_id` reads nothing rather than another workspace.
 */

/** Every tenant table, by name. A migration that creates one adds it here in the same pull request. */
export const TENANT_TABLES = [
  "workspace_counters",
  "audit_events",
  "outbox",
  "undo_tokens",
  "idempotency_keys",
  "files",
  "roles",
  "teams",
  "members",
  "setup_tasks",
  "invitations",
  "invite_links",
  "access_requests",
  "api_keys",
  "api_requests",
  "user_prefs",
  "saved_views",
  "todos",
  "recents",
  "notifications",
  "notification_prefs",
  "connections",
  "connection_credentials",
  "connection_incidents",
  "oauth_states",
  "sync_cursors",
  "stores",
  "products",
  "variants",
  "inventory_levels",
  "customers",
  "orders",
  "order_lines",
  "fulfilments",
  "refunds",
  "inbound_events",
  "gdpr_requests",
  "first_analyses",
  "order_notes",
  "customer_not_duplicates",
  "marketing_syncs",
  "suppliers",
  "supplier_contacts",
  "supplier_integrations",
  "product_supply",
  "forwarding_items",
  "supplier_work",
  "deliveries",
  "return_settings",
  "return_reasons",
  "return_rules",
  "return_addresses",
  "claim_flows",
  "returns",
  "return_lines",
  "return_events",
  "tickets",
  "ticket_assignees",
  "ticket_watchers",
  "ticket_labels",
  "ticket_comments",
  "ticket_templates",
  "quality_checks",
  "quality_check_media",
  "product_phases",
  "quality_settings",
  "stockouts",
  "queue_items"
] as const
export type TenantTable = (typeof TENANT_TABLES)[number]

/**
 * The statements that put a tenant table behind the workspace policy: rows are visible and writable only where
 * `workspace_id` is the request's (`app.workspace_id`, set by `Db`). `membersOnly` adds a restrictive policy so a
 * partner principal (supplier contact, affiliate) sees nothing, whatever the workspace.
 */
export const tenantTable = (table: TenantTable, options: { readonly membersOnly?: boolean } = {}): Array<string> => [
  `alter table ${table} enable row level security`,
  `alter table ${table} force row level security`,
  `create policy ${table}_ws on ${table} as permissive for all
     using (workspace_id = app_workspace_id()) with check (workspace_id = app_workspace_id())`,
  ...(options.membersOnly === true
    ? [`create policy ${table}_members on ${table} as restrictive for all using (app_is_member_side())`]
    : [])
]

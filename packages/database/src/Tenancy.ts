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
  "return_mails",
  "tickets",
  "ticket_assignees",
  "ticket_watchers",
  "ticket_labels",
  "ticket_comments",
  "ticket_templates",
  "chargebacks",
  "evidence_items",
  "chargeback_events",
  "evidence_packs",
  "quality_checks",
  "quality_check_media",
  "product_phases",
  "quality_settings",
  "stockouts",
  "queue_items",
  "proposals",
  "proposal_revisions",
  "order_mails",
  "fact_dirty_days",
  "fact_orders_day",
  "fact_refunds_day",
  "fact_deliveries_day",
  "conversations",
  "conversation_members",
  "messages",
  "message_reactions",
  "chat_actions",
  "mailboxes",
  "email_threads",
  "email_messages",
  "attachments",
  "notification_settings",
  "notification_deliveries",
  "digests",
  "push_subscriptions",
  "automations",
  "automation_versions",
  "automation_settings",
  "service_accounts",
  "automation_runs",
  "automation_run_steps",
  "cost_lines",
  "cost_line_amounts",
  "ad_spend_day",
  "workspace_settings",
  "retention_runs",
  "webhook_endpoints",
  "webhook_deliveries",
  "fact_tickets_day",
  "course_chapters",
  "course_modules",
  "courses",
  "course_progress",
  "course_questions",
  "app_installs",
  "app_feedback",
  // Live (M14 step 3): a store's Web Pixel and the hash of its ingest key.
  "store_pixels",
  "sheet_folders",
  "sheets",
  "sheet_tabs",
  "sheet_shares",
  "sheet_member_state",
  "supplier_statements",
  "supplier_statement_lines",
  "agents",
  "autonomy_policies",
  "autonomy_policy_versions",
  "agent_actions",
  "agent_touchpoints",
  "ai_budgets",
  "sending_domains"
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

/** A supplier contact acting for its own supplier, whose rows `own` (a predicate over the table's columns) names. */
const asPartner = (own: string) =>
  `app_principal_kind() = 'supplier_contact' and app_partner_id() is not null and (${own})`

/**
 * A members-only table opened to a supplier contact (06 §5 family S, domain.md §18.1). Reading: the member side, or a
 * supplier contact's own rows (`own`, a predicate over the table's columns and `app_partner_id()`). Writing: the member
 * side only, unless the portal writes there: `update`, `insert` and `remove` name the rows a contact may change, add or
 * take away (each also held to `own`). Each is one restrictive policy, so a missing `app.partner_id` yields nothing, and
 * a partner can never write a row that widens what it reads. Which columns it may change is `partnerGuard`'s.
 * `replaces` drops the members-only policy it widens (a contract migration, then).
 */
export const supplierProjection = (
  table: TenantTable,
  own: string,
  options: {
    readonly replaces?: boolean
    readonly update?: string
    readonly insert?: string
    readonly remove?: string
  } = {}
): Array<string> => {
  const or = (writes: string | undefined) =>
    writes === undefined ? "" : ` or (${asPartner(`(${own}) and (${writes})`)})`
  return [
    ...(options.replaces === false ? [] : [`drop policy ${table}_members on ${table}`]),
    `create policy ${table}_side on ${table} as restrictive for select using (
       app_is_member_side() or (${asPartner(own)}))`,
    `create policy ${table}_side_insert on ${table} as restrictive for insert
       with check (app_is_member_side()${or(options.insert)})`,
    `create policy ${table}_side_update on ${table} as restrictive for update
       using (app_is_member_side()${or(options.update)}) with check (app_is_member_side()${or(options.update)})`,
    `create policy ${table}_side_delete on ${table} as restrictive for delete
       using (app_is_member_side()${or(options.remove)})`
  ]
}

/**
 * The columns a partner principal may change on a row it may update (`supplierProjection`'s `update`): any other column
 * changed by a supplier contact or an affiliate is refused (`partner_update_guard`, 0075), so the row's keys, its lines
 * and who it belongs to stay as the brand set them.
 */
export const partnerGuard = (table: TenantTable, columns: ReadonlyArray<string>): string =>
  `create trigger ${table}_partner_guard before update on ${table} for each row
     execute function partner_update_guard(${[...columns, "updated_at"].map((c) => `'${c}'`).join(", ")})`

/**
 * A workspace table no partner principal reads at all: the team's, its settings, its stores. The workspace policy
 * already holds it to the workspace; this keeps a supplier contact or an affiliate inside it out.
 */
export const partnerBlind = (table: TenantTable | "workspaces"): string =>
  `create policy ${table}_no_partner on ${table} as restrictive for all
     using (app_principal_kind() is null or app_principal_kind() not in ('supplier_contact', 'affiliate'))`

/**
 * A table whose rows carry what a partner never reads (the customer's email and phone, the internal note, totals and
 * shelf prices; M16 decision 6): closed to a partner principal connected as the app, whatever its projection says.
 * The supplier views read it as their owner, each filtering to the calling partner and naming only the columns it may
 * see; the projection still holds those reads to the partner's own rows.
 */
export const partnerClosed = (table: TenantTable): string =>
  `create policy ${table}_partner_closed on ${table} as restrictive for all to insyte_app
     using (app_principal_kind() is null or app_principal_kind() not in ('supplier_contact', 'affiliate'))`

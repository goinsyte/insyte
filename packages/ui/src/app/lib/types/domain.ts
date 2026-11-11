export type Currency = "USD" | "EUR" | "GBP";

export type OrderStatus =
	| "placed"
	| "paid"
	| "at_supplier"
	| "shipped"
	| "delivered"
	| "cancelled"
	| "refunded";

export type Address = {
	line1: string;
	line2?: string;
	city: string;
	region: string;
	postal_code: string;
	country: string;
};

export type Customer = {
	id: string;
	shopify_id: string;
	email: string;
	name: string;
	phone?: string;
	address?: Address;
	lifetime_value: number;
	orders_count: number;
	tags: string[];
	created_at: string;
};

export type Variant = {
	id: string;
	product_id: string;
	sku: string;
	title: string;
	price: number;
	compare_at_price?: number;
	inventory_level: number;
	supplier_id?: string;
};

export type Product = {
	id: string;
	store_id: string;
	shopify_id: string;
	title: string;
	images: string[];
	description: string;
	price: number;
	cost?: number;
	margin?: number;
	currency: Currency;
	supplier_id?: string;
	variants: Variant[];
	status: "active" | "draft" | "archived";
	tags: string[];
	created_at: string;
};

export type OrderLineItem = {
	id: string;
	product_id: string;
	variant_id: string;
	title: string;
	variant_title?: string;
	quantity: number;
	unit_price: number;
	supplier_id?: string;
};

export type Order = {
	id: string;
	number: string;
	store_id: string;
	shopify_id: string;
	customer_id: string;
	customer_name: string;
	customer_email: string;
	status: OrderStatus;
	payment_status: "pending" | "paid" | "refunded" | "voided";
	fulfillment_status: "unfulfilled" | "partial" | "fulfilled" | "returned";
	total: number;
	currency: Currency;
	line_items: OrderLineItem[];
	/** How many lines, where the host lists orders without them (the console's list, M6.4). */
	line_count?: number;
	shipping_address?: Address;
	tracking_number?: string;
	carrier?: string;
	estimated_delivery?: string;
	tags: string[];
	notes?: string;
	created_at: string;
	updated_at: string;
};

export type TicketPriority = "low" | "medium" | "high";
export type TicketStatus = "intake" | "in_progress" | "awaiting_reply" | "done";

export type Ticket = {
	id: string;
	number: string;
	title: string;
	description: string;
	status: TicketStatus;
	priority: TicketPriority;
	tags: string[];
	assignee_ids: string[];
	related_entity?: {
		type: "order" | "customer" | "chargeback";
		id: string;
		label: string;
	};
	template?: string;
	due_at?: string;
	/** Where the ticket came from: a connected mailbox, Shopify, a payment provider, chat, an automation. */
	source?: TicketSource;
	/** Out of the open views until then. */
	snoozed_until?: string;
	/** Kept, but out of every view except Archived. */
	archived_at?: string;
	/** In the trash: out of every list but Trash, and restorable from there. */
	deleted_at?: string;
	/** Reported as spam: out of every list but Spam. */
	spam_at?: string;
	created_at: string;
	updated_at: string;
};

export type TicketSource = "gmail" | "outlook" | "email" | "shopify" | "klarna" | "chat" | "insyte" | "manual" | "supplier";

export type Email = {
	id: string;
	thread_id: string;
	from: { name: string; email: string };
	to: { name: string; email: string }[];
	subject: string;
	body_html: string;
	body_text: string;
	direction: "inbound" | "outbound";
	read: boolean;
	starred: boolean;
	ticket_id?: string;
	attachments: { name: string; size: number }[];
	sent_at: string;
};

export type EmailThread = {
	id: string;
	subject: string;
	participants: { name: string; email: string }[];
	last_message_at: string;
	last_message_preview: string;
	unread: boolean;
	starred: boolean;
	labels: string[];
	ticket_id?: string;
	messages: Email[];
};

export type ChargebackStatus =
	| "open"
	| "awaiting_evidence"
	| "submitted"
	| "won"
	| "lost";

export type Chargeback = {
	id: string;
	case_number: string;
	provider: "paypal" | "klarna" | "stripe";
	customer_id: string;
	customer_name: string;
	amount: number;
	currency: Currency;
	reason: string;
	status: ChargebackStatus;
	deadline_at: string;
	opened_at: string;
	evidence_files: { name: string; size: number; kind: string }[];
	timeline: {
		at: string;
		actor: string;
		event: string;
	}[];
	order_id?: string;
	notes?: string;
};

export type Supplier = {
	id: string;
	name: string;
	contact_email: string;
	contact_phone?: string;
	logo_url?: string;
	status: "active" | "pending" | "inactive";
	api_connected: boolean;
	stock_indicator: "live" | "in_stock_out_of_stock" | "none";
	assigned_product_count: number;
	created_at: string;
};

export type Store = {
	id: string;
	name: string;
	domain: string;
	platform: "shopify";
	connected: boolean;
	country: string;
	currency: Currency;
	created_at: string;
};

export type Organization = {
	id: string;
	name: string;
	logo_url?: string;
	country: string;
	billing_plan: "trial" | "starter" | "pro" | "enterprise";
	trial_ends_at?: string;
};

export type Member = {
	id: string;
	user_id: string;
	name: string;
	email: string;
	avatar_url?: string;
	role: string;
	status: "active" | "invited";
	last_active_at?: string;
};

export type Permission = "none" | "view" | "edit";

export type Role = {
	id: string;
	name: string;
	description: string;
	built_in: boolean;
	permissions: Record<string, Permission>;
	special: Record<string, boolean>;
};

export type Integration = {
	id: string;
	name: string;
	kind: string;
	logo_url?: string;
	connected: boolean;
	description: string;
};

export type Automation = {
	id: string;
	name: string;
	description: string;
	trigger: string;
	trigger_label?: string; // short label for trigger pill
	actions: string[];
	flow_steps?: string[]; // chip labels e.g. ["Order delay", "Email", "Ticket"]
	platform?: string; // e.g. "Klaviyo + Platform"
	total_runs?: number;
	status: "active" | "paused" | "draft";
	runs_30d: number;
	last_run_at?: string;
	created_at: string;
};

export type Extension = {
	id: string;
	name: string;
	tagline: string;
	category: string;
	logo_url?: string;
	installed: boolean;
	price?: string;
	rating: number;
	install_count: number;
};

export type ActivityEvent = {
	id: string;
	type:
		| "order_created"
		| "order_fulfilled"
		| "ticket_created"
		| "ticket_resolved"
		| "chargeback_opened"
		| "chargeback_won"
		| "automation_ran"
		| "customer_signup";
	title: string;
	subtitle: string;
	at: string;
	actor?: { name: string; avatar_url?: string };
	link?: string;
};

export type AnalyticsMetric = {
	id: string;
	label: string;
	value: number | string;
	delta?: number;
	delta_kind?: "positive" | "negative" | "neutral";
	unit?: string;
	format?: "currency" | "percent" | "duration" | "number";
};

export type TimeSeriesPoint = {
	label: string;
	value: number;
};

export type Affiliate = {
	id: string;
	user_id: string;
	name: string;
	email: string;
	avatar_url?: string;
	status: "approved" | "pending" | "rejected";
	referral_code: string;
	tier: "bronze" | "silver" | "gold";
	commission_rate: number;
	created_at: string;
	approved_at?: string;
	rejection_reason?: string;
};

export type ReferralLink = {
	id: string;
	affiliate_id: string;
	label: string;
	url: string;
	clicks: number;
	conversions: number;
	revenue: number;
	created_at: string;
};

export type Payout = {
	id: string;
	affiliate_id: string;
	amount: number;
	currency: Currency;
	status: "pending" | "processing" | "paid" | "failed";
	method: string;
	requested_at: string;
	paid_at?: string;
};

export type ChatMessage = {
	id: string;
	conversation_id: string;
	sender_id: string;
	sender_name: string;
	body: string;
	at: string;
	attachments?: { name: string; size: number }[];
};

export type Conversation = {
	id: string;
	type: "dm" | "group";
	name: string;
	participants: { id: string; name: string; avatar_url?: string }[];
	last_message_at: string;
	last_message_preview: string;
	unread_count: number;
	messages: ChatMessage[];
};

export type CurrentUser = {
	id: string;
	name: string;
	email: string;
	avatar_url?: string;
	role: string;
};

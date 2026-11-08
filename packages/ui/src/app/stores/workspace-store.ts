import { create } from "zustand";
import { type Parcel, PROBLEM_LABEL, type ProblemKind, type SupplierWork, workKey } from "../lib/supplier-work";
import { chargebacks as seedChargebacks, channelsSeed } from "../../data-source";
import { members as seedMembers } from "../../data-source";
import { orders as seedOrders } from "../../data-source";
import { type QueueRow, queue as seedQueue } from "../../data-source";
import { stores as seedStores } from "../../data-source";
import { tickets as seedTickets } from "../../data-source";
import type {
	Address,
	Chargeback,
	Customer,
	Member,
	Order,
	Product,
	Store,
	Ticket,
	TicketStatus,
} from "../lib/types/domain";

/**
 * What the operator changed about a customer. The profiles come from the API mock, so the change is
 * kept beside them and laid over the list wherever it is read (`applyCustomerEdits`).
 */
export type CustomerEdit = {
	tags?: string[];
	/** Merged away into this customer; the profile no longer appears. */
	mergedInto?: string;
	/** What merged into this one: their orders, value and addresses now count here. */
	absorbed?: { ids: string[]; orders: number; value: number; emails: string[] };
	klaviyo?: { list: string; at: string };
};

export function applyCustomerEdits(list: ReadonlyArray<Customer>, edits: Record<string, CustomerEdit>): Customer[] {
	return list
		.filter((c) => edits[c.id]?.mergedInto === undefined)
		.map((c) => {
			const e = edits[c.id];
			if (!e) return c;
			return {
				...c,
				tags: e.tags ?? c.tags,
				orders_count: c.orders_count + (e.absorbed?.orders ?? 0),
				lifetime_value: c.lifetime_value + (e.absorbed?.value ?? 0),
			};
		});
}

/** What the operator changed about a product, laid over the API's copy like `CustomerEdit`. */
export type ProductEdit = Partial<Pick<Product, "title" | "description" | "price" | "cost" | "status" | "supplier_id">> & {
	/** Ads on this product were paused from the low-stock advice. */
	adsPaused?: boolean;
	/** Units on hand per variant, as the supplier last reported them. */
	variantStock?: Record<string, number>;
	/** Days from order to hand-off, as the supplier states it. */
	leadDays?: number;
};

export function applyProductEdits(list: ReadonlyArray<Product>, edits: Record<string, ProductEdit>): Product[] {
	return list.map((p) => {
		const e = edits[p.id];
		if (!e) return p;
		const { adsPaused: _ads, variantStock, leadDays: _lead, ...fields } = e;
		const variants = variantStock ? p.variants.map((v) => (v.id in variantStock ? { ...v, inventory_level: variantStock[v.id]! } : v)) : p.variants;
		const next = { ...p, ...fields, variants };
		return next.cost === undefined ? next : { ...next, margin: next.price > 0 ? ((next.price - next.cost) / next.price) * 100 : 0 };
	});
}

/** A draft order as the New order dialog hands it over. */
export type NewOrder = {
	customer_name: string;
	customer_email: string;
	store: string;
	notes: string;
	items: ReadonlyArray<{ sku: string; title: string; qty: number; price: number }>;
};

/**
 * The workspace, as one piece of client state every screen reads and every action changes.
 *
 * There is no backend in this repo and there will not be one this phase. What there was instead:
 * each screen imported its own fixture and each button either did nothing or fired a toast that said
 * something had happened when nothing had. "Refunded" with the order still paid; "Invitation sent"
 * with the team unchanged; a plate filed that stayed in the queue. A demo that lies the moment you
 * look twice is worse than one that admits it is a demo.
 *
 * So the fixtures seed this store once, and every action is a real state change the rest of the
 * console sees: file a plate and the row leaves the queue and the count drops; refund an order and
 * its payment status and timeline change, and the chargeback that cites it knows. Anything a real
 * service would take time over (connecting Shopify, building an evidence pack) is a short simulated
 * wait with a visible in-between state, because the in-between state is a design problem too.
 *
 * Nothing persists across a reload, on purpose: a demo should start from the same place every time.
 * This is the seam the Phase 2 API lands on — the action names are the use-case names.
 */

export type QueueState = "open" | "filed" | "discarded";
export type QueueItem = QueueRow & { state: QueueState; redraws: number };

export type IntegrationStatus = "connected" | "disconnected" | "action_required" | "connecting";

export type WorkspaceIntegration = {
	key: string;
	name: string;
	description: string;
	category: "Commerce" | "Payments" | "Email" | "Channels" | "Marketing" | "AI";
	status: IntegrationStatus;
	/** When it last synced, for the connected ones. */
	syncedAt?: string;
};

export type SupplierSnapshot = { work: Record<string, SupplierWork>; orders: Order[]; tickets: Ticket[] };

export type WorkspaceStore = Store & { status: "connected" | "connecting" | "disconnected" };

const SEED_INTEGRATIONS: WorkspaceIntegration[] = [
	{ key: "shopify", name: "Shopify", description: "Bestellingen, producten en klanten", category: "Commerce", status: "connected", syncedAt: "2026-10-27T08:12:00Z" },
	{ key: "stripe", name: "Stripe", description: "Kaartbetalingen, terugbetalingen en geschillen", category: "Payments", status: "connected", syncedAt: "2026-10-27T08:10:00Z" },
	{ key: "klarna", name: "Klarna", description: "Geschillen en betalingen", category: "Payments", status: "connected", syncedAt: "2026-10-27T07:55:00Z" },
	{ key: "paypal", name: "PayPal", description: "Geschillen en betalingen", category: "Payments", status: "action_required" },
	{ key: "gmail", name: "Gmail", description: "Inbox en gesprekken", category: "Email", status: "connected", syncedAt: "2026-10-27T08:14:00Z" },
	{ key: "outlook", name: "Outlook", description: "Inbox en gesprekken", category: "Email", status: "disconnected" },
	{ key: "klaviyo", name: "Klaviyo", description: "E-mail- en sms-campagnes", category: "Marketing", status: "connected", syncedAt: "2026-10-27T06:40:00Z" },
	{ key: "meta", name: "Meta Ads", description: "Advertentiekosten en resultaten per campagne", category: "Marketing", status: "connected", syncedAt: "2026-10-27T07:30:00Z" },
	{ key: "google-ads", name: "Google Ads", description: "Advertentiekosten en resultaten per campagne", category: "Marketing", status: "disconnected" },
	{ key: "anthropic", name: "Anthropic", description: "Claude, voor opgestelde antwoorden en voorstellen", category: "AI", status: "connected", syncedAt: "2026-10-27T08:14:00Z" },
];

export type WorkspaceState = {
	queue: QueueItem[];
	/** Customers and products made in this session. The fixtures behind them come from the API mock. */
	createdCustomers: Customer[];
	createdProducts: Product[];
	customerEdits: Record<string, CustomerEdit>;
	productEdits: Record<string, ProductEdit>;
	/** Suppliers the operator stopped sending new orders to. */
	pausedSuppliers: string[];
	/** Duplicate groups the operator said are different people. */
	notDuplicates: string[];
	chargebacks: Chargeback[];
	orders: Order[];
	tickets: Ticket[];
	members: Member[];
	stores: WorkspaceStore[];
	activeStoreId: string;
	integrations: WorkspaceIntegration[];
	/** What suppliers did on their part of an order, by `orderId|supplierId`; the brand sees all of it. */
	supplierWork: Record<string, SupplierWork>;
	/** Photos and videos a supplier uploaded for a product, by product id; the brand sees them. */
	productMedia: Record<string, Array<{ id: string; name: string; size: number; type: string; at: string; by: string }>>;
	/** The account fields on Settings → Account. */
	account: {
		workspace: string;
		legalEntity: string;
		vat: string;
		billingEmail: string;
		country: string;
		timezone: string;
	};
};

export type WorkspaceActions = {
	fileQueue: (id: string) => QueueState | undefined;
	discardQueue: (id: string) => QueueState | undefined;
	restoreQueue: (id: string, state: QueueState) => void;
	redrawQueue: (id: string) => void;

	buildEvidence: (chargebackId: string) => Promise<void>;
	submitEvidence: (chargebackId: string) => void;
	acceptChargeback: (chargebackId: string) => void;
	setChargebackNote: (chargebackId: string, note: string) => void;
	restoreChargeback: (chargeback: Chargeback) => void;

	refundOrder: (orderId: string) => Order | undefined;
	cancelOrder: (orderId: string) => Order | undefined;
	restoreOrder: (order: Order) => void;
	updateShipping: (orderId: string, address: Address) => void;
	addOrderNote: (orderId: string, note: string) => void;

	acceptSupplierOrders: (supplierId: string, orderIds: ReadonlyArray<string>) => void;
	shipSupplierParcel: (supplierId: string, orderId: string, parcel: Omit<Parcel, "id" | "at">) => void;
	reportSupplierProblem: (supplierId: string, supplierName: string, orderId: string, problem: { kind: ProblemKind; note: string; newDate?: string }) => void;
	/** What a supplier action changes, taken before it, so Undo puts all three back. */
	supplierSnapshot: () => SupplierSnapshot;
	addProductMedia: (productId: string, files: ReadonlyArray<{ id: string; name: string; size: number; type: string }>, by: string) => void;
	removeProductMedia: (productId: string, id: string) => void;
	restoreSupplier: (snap: SupplierSnapshot) => void;

	createOrder: (draft: NewOrder) => Order;
	createCustomer: (draft: Pick<Customer, "name" | "email"> & Partial<Customer>) => Customer;
	createProduct: (draft: Pick<Product, "title" | "price"> & Partial<Product> & { sku?: string }) => Product;
	removeOrder: (id: string) => void;
	editProducts: (patches: Record<string, ProductEdit>) => void;
	restoreProducts: (edits: Record<string, ProductEdit>) => void;
	toggleSupplierPause: (supplierId: string) => void;
	tagCustomers: (customers: ReadonlyArray<Customer>, tags: ReadonlyArray<string>, mode: "add" | "remove") => void;
	mergeCustomers: (keep: Customer, others: ReadonlyArray<Customer>) => void;
	syncToKlaviyo: (ids: ReadonlyArray<string>, list: string) => void;
	notDuplicate: (key: string) => void;
	/** Puts customer edits back as they were, for Undo. */
	restoreCustomers: (edits: Record<string, CustomerEdit>, notDuplicates: string[]) => void;
	removeCustomer: (id: string) => void;
	removeProduct: (id: string) => void;

	createTicket: (draft: Pick<Ticket, "title" | "description" | "priority"> & Partial<Ticket>) => Ticket;
	setTicketStatus: (ticketId: string, status: TicketStatus) => TicketStatus | undefined;
	assignTicket: (ticketId: string, memberId: string) => void;

	inviteMember: (email: string, role: string) => Member;
	resendInvite: (memberId: string) => void;
	setMemberRole: (memberId: string, role: string) => void;
	removeMember: (memberId: string) => { member: Member; index: number } | undefined;
	restoreMember: (member: Member, index: number) => void;

	connectStore: (domain: string, name?: string) => Promise<WorkspaceStore>;
	reconnectStore: (storeId: string) => Promise<void>;
	disconnectStore: (storeId: string) => void;
	setActiveStore: (storeId: string) => void;

	connectIntegration: (key: string) => Promise<void>;
	disconnectIntegration: (key: string) => void;
	syncIntegration: (key: string) => Promise<void>;


	saveAccount: (account: WorkspaceState["account"]) => void;
};

/** A service taking its time, at a length an operator would believe. */
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const now = () => new Date().toISOString();

const slug = (text: string) =>
	text
		.toLowerCase()
		.replace(/\.myshopify\.com$/, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");

const titleFromDomain = (domain: string) =>
	slug(domain)
		.split("-")
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");

/** The evidence an operator would assemble for a dispute, gathered one document at a time. */
const EVIDENCE = [
	{ name: "carrier-scan.pdf", size: 182_000, kind: "tracking" },
	{ name: "delivery-photo.jpg", size: 1_240_000, kind: "delivery" },
	{ name: "customer-replies.pdf", size: 96_000, kind: "correspondence" },
	{ name: "original-invoice.pdf", size: 64_000, kind: "invoice" },
];

export const useWorkspace = create<WorkspaceState & WorkspaceActions>()((set, get) => {
	const patchChargeback = (id: string, patch: (c: Chargeback) => Chargeback) =>
		set((s) => ({ chargebacks: s.chargebacks.map((c) => (c.id === id ? patch(c) : c)) }));
	const patchOrder = (id: string, patch: (o: Order) => Order) =>
		set((s) => ({ orders: s.orders.map((o) => (o.id === id ? patch(o) : o)) }));
	const patchQueue = (id: string, patch: (q: QueueItem) => QueueItem) =>
		set((s) => ({ queue: s.queue.map((q) => (q.id === id ? patch(q) : q)) }));
	const patchIntegration = (key: string, patch: Partial<WorkspaceIntegration>) =>
		set((s) => ({ integrations: s.integrations.map((i) => (i.key === key ? { ...i, ...patch } : i)) }));
	const patchStore = (id: string, patch: Partial<WorkspaceStore>) =>
		set((s) => ({ stores: s.stores.map((st) => (st.id === id ? { ...st, ...patch } : st)) }));

	return {
		queue: seedQueue.map((row) => ({ ...row, state: "open", redraws: 0 })),
		chargebacks: seedChargebacks,
		orders: seedOrders,
		// One ticket snoozed and one archived, so those views have something real in them.
		tickets: seedTickets.map((t, i) =>
			i === 9
				? { ...t, snoozed_until: new Date(Date.now() + 2 * 86_400_000).toISOString() }
				: i === 7
					? { ...t, archived_at: "2026-10-20T09:00:00Z" }
					: t,
		),
		members: seedMembers,
		createdCustomers: [],
		createdProducts: [],
		customerEdits: {},
		productEdits: {},
		pausedSuppliers: [],
		notDuplicates: [],
		stores: seedStores.map((s) => ({ ...s, status: s.connected ? "connected" : "disconnected" })),
		activeStoreId: seedStores[0]?.id ?? "",
		// The chat channels (PLAN 27) are integrations like the mailboxes, with their state per design state.
		integrations: [
			...SEED_INTEGRATIONS,
			...(["whatsapp", "instagram", "webchat"] as const).map((key): WorkspaceIntegration => {
				const a = channelsSeed.accounts[key];
				return {
					key,
					name: key === "whatsapp" ? "WhatsApp Business" : key === "instagram" ? "Instagram" : "Websitechat",
					description: a.account ? `${a.detail} · ${a.account}` : a.detail,
					category: "Channels",
					status: a.status,
					syncedAt: a.status === "connected" ? new Date(Date.now() - 4 * 60_000).toISOString() : undefined,
				};
			}),
		],
		supplierWork: {},
		productMedia: {},
		account: {
			workspace: "Northwind Clothing Co.",
			legalEntity: "Northwind Clothing B.V.",
			vat: "NL862922088B01",
			billingEmail: "finance@northwind.co",
			country: "Netherlands",
			timezone: "Europe/Amsterdam (UTC+1)",
		},

		/* ── the queue ─────────────────────────────────────────────────────────────────────── */

		fileQueue: (id) => {
			const row = get().queue.find((q) => q.id === id);
			if (!row) return undefined;
			patchQueue(id, (q) => ({ ...q, state: "filed" }));
			// Filing the Klarna plate is filing the Klarna evidence: the chargeback screen has to agree.
			const cb = row.plate ? get().chargebacks.find((c) => c.case_number === row.plate?.number) : undefined;
			if (cb && cb.status !== "submitted") {
				if (cb.evidence_files.length === 0) patchChargeback(cb.id, (c) => ({ ...c, evidence_files: EVIDENCE }));
				get().submitEvidence(cb.id);
			}
			return row.state;
		},
		discardQueue: (id) => {
			const row = get().queue.find((q) => q.id === id);
			if (!row) return undefined;
			patchQueue(id, (q) => ({ ...q, state: "discarded" }));
			return row.state;
		},
		restoreQueue: (id, state) => patchQueue(id, (q) => ({ ...q, state })),
		redrawQueue: (id) =>
			patchQueue(id, (q) =>
				q.plate
					? {
							...q,
							redraws: q.redraws + 1,
							plate: {
								...q.plate,
								// A redraw is a second reading of the same record, so the drawing changes and the
								// confidence moves; the record it describes does not.
								// The label's wording comes from the plate; only its number is redrawn, read and written nl-NL.
								confidence: q.plate.confidence.replace(/\d+(?:[.,]\d+)?/, (n) =>
									(Number.parseFloat(n.replace(",", ".")) + (q.redraws % 2 === 0 ? 0.3 : -0.2)).toLocaleString("nl-NL", {
										minimumFractionDigits: 1,
										maximumFractionDigits: 1,
									}),
								),
								state: `${q.redraws + 1}× opnieuw opgesteld, niet uitgevoerd`,
							},
						}
					: q,
			),

		/* ── chargebacks ───────────────────────────────────────────────────────────────────── */

		buildEvidence: async (id) => {
			for (const file of EVIDENCE) {
				await wait(420);
				patchChargeback(id, (c) =>
					c.evidence_files.some((f) => f.name === file.name) ? c : { ...c, evidence_files: [...c.evidence_files, file] },
				);
			}
			patchChargeback(id, (c) => ({
				...c,
				timeline: [{ at: now(), actor: "Insyte", event: `Bewijspakket opgesteld · ${c.evidence_files.length} ${c.evidence_files.length === 1 ? "document" : "documenten"}` }, ...c.timeline],
			}));
		},
		submitEvidence: (id) =>
			patchChargeback(id, (c) => ({
				...c,
				status: "submitted",
				timeline: [{ at: now(), actor: "Jij", event: `Bewijs ingediend bij ${c.provider}` }, ...c.timeline],
			})),
		acceptChargeback: (id) =>
			patchChargeback(id, (c) => ({
				...c,
				status: "lost",
				timeline: [{ at: now(), actor: "Jij", event: "Geschil geaccepteerd · geld teruggestort aan de klant" }, ...c.timeline],
			})),
		setChargebackNote: (id, note) => patchChargeback(id, (c) => ({ ...c, notes: note })),
		restoreChargeback: (chargeback) => patchChargeback(chargeback.id, () => chargeback),

		/* ── orders ────────────────────────────────────────────────────────────────────────── */

		refundOrder: (id) => {
			const before = get().orders.find((o) => o.id === id);
			if (!before) return undefined;
			patchOrder(id, (o) => ({ ...o, payment_status: "refunded", status: "refunded", updated_at: now() }));
			return before;
		},
		cancelOrder: (id) => {
			const before = get().orders.find((o) => o.id === id);
			if (!before) return undefined;
			patchOrder(id, (o) => ({ ...o, status: "cancelled", payment_status: o.payment_status === "paid" ? "voided" : o.payment_status, updated_at: now() }));
			return before;
		},
		restoreOrder: (order) => patchOrder(order.id, () => order),
		updateShipping: (id, address) => patchOrder(id, (o) => ({ ...o, shipping_address: address, updated_at: now() })),
		addOrderNote: (id, note) => patchOrder(id, (o) => ({ ...o, notes: note, updated_at: now() })),

		/* ── supplier work ─────────────────────────────────────────────────────────────────── */

		acceptSupplierOrders: (supplierId, ids) =>
			set((s) => {
				const work = { ...s.supplierWork };
				for (const id of ids) {
					const k = workKey(id, supplierId);
					work[k] = { ...(work[k] ?? { parcels: [] }), accepted_at: now() };
				}
				return {
					supplierWork: work,
					orders: s.orders.map((o) =>
						ids.includes(o.id) && (o.status === "placed" || o.status === "paid") ? { ...o, status: "at_supplier", updated_at: now() } : o,
					),
				};
			}),
		shipSupplierParcel: (supplierId, id, parcel) =>
			set((s) => {
				const k = workKey(id, supplierId);
				const w = s.supplierWork[k] ?? { parcels: [] };
				const next: SupplierWork = { ...w, accepted_at: w.accepted_at ?? now(), problem: undefined, parcels: [...w.parcels, { ...parcel, id: `pc_${Date.now().toString(36)}`, at: now() }] };
				return {
					supplierWork: { ...s.supplierWork, [k]: next },
					orders: s.orders.map((o) =>
						o.id === id
							? {
									...o,
									status: "shipped",
									carrier: o.carrier ?? parcel.carrier,
									tracking_number: o.tracking_number ?? parcel.tracking,
									tags: [...o.tags.filter((t) => t !== "at_risk"), ...(o.tags.includes("tracking_sent") ? [] : ["tracking_sent"])],
									updated_at: now(),
								}
							: o,
					),
				};
			}),
		reportSupplierProblem: (supplierId, supplierName, id, problem) => {
			const order = get().orders.find((o) => o.id === id);
			if (!order) return;
			const ticket = get().createTicket({
				title: `${supplierName}: ${PROBLEM_LABEL[problem.kind].toLowerCase()} bij ${order.number}`,
				description: `${problem.note}${problem.newDate ? ` Nieuwe overdrachtsdatum: ${new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long" }).format(new Date(problem.newDate))}.` : ""}`,
				priority: problem.kind === "stock" || problem.kind === "address" ? "high" : "medium",
				tags: ["Leverancier"],
				source: "supplier",
				related_entity: { type: "order", id: order.id, label: order.number },
			});
			set((s) => {
				const k = workKey(id, supplierId);
				const w = s.supplierWork[k] ?? { parcels: [] };
				return {
					supplierWork: { ...s.supplierWork, [k]: { ...w, problem: { ...problem, at: now(), ticketId: ticket.id } } },
					orders: s.orders.map((o) => (o.id === id ? { ...o, tags: o.tags.includes("at_risk") ? o.tags : [...o.tags, "at_risk"], updated_at: now() } : o)),
				};
			});
		},
		addProductMedia: (productId, files, by) =>
			set((s) => ({ productMedia: { ...s.productMedia, [productId]: [...files.map((f) => ({ ...f, at: now(), by })), ...(s.productMedia[productId] ?? [])] } })),
		removeProductMedia: (productId, id) =>
			set((s) => ({ productMedia: { ...s.productMedia, [productId]: (s.productMedia[productId] ?? []).filter((m) => m.id !== id) } })),
		supplierSnapshot: () => ({ work: get().supplierWork, orders: get().orders, tickets: get().tickets }),
		restoreSupplier: (snap) => set({ supplierWork: snap.work, orders: snap.orders, tickets: snap.tickets }),

		/* ── records made by hand ───────────────────────────────────────────────────────────── */

		createOrder: (draft) => {
			const next = Math.max(12000, ...get().orders.map((o) => Number.parseInt(o.number.replace(/\D/g, ""), 10) || 0)) + 1;
			const store = get().stores.find((st) => st.name === draft.store) ?? get().stores[0];
			const order: Order = {
				id: `ord_draft_${next}`,
				number: `SO-${next}`,
				store_id: store?.id ?? "",
				shopify_id: "",
				customer_id: "",
				customer_name: draft.customer_name,
				customer_email: draft.customer_email,
				status: "placed",
				payment_status: "pending",
				fulfillment_status: "unfulfilled",
				total: draft.items.reduce((n, i) => n + i.qty * i.price, 0),
				currency: store?.currency ?? "EUR",
				line_items: draft.items.map((i, k) => ({
					id: `li_${next}_${k}`,
					product_id: "",
					variant_id: i.sku,
					title: i.title,
					quantity: i.qty,
					unit_price: i.price,
				})),
				tags: ["concept"],
				notes: draft.notes || undefined,
				created_at: now(),
				updated_at: now(),
			};
			set((s) => ({ orders: [order, ...s.orders] }));
			return order;
		},
		createCustomer: (draft) => {
			const customer: Customer = {
				id: `cus_new_${Date.now().toString(36)}`,
				shopify_id: "",
				lifetime_value: 0,
				orders_count: 0,
				tags: [],
				created_at: now(),
				...draft,
			};
			set((s) => ({ createdCustomers: [customer, ...s.createdCustomers] }));
			return customer;
		},
		createProduct: ({ sku, ...draft }) => {
			const id = `prd_new_${Date.now().toString(36)}`;
			const product: Product = {
				id,
				store_id: get().activeStoreId,
				shopify_id: "",
				images: [],
				description: "",
				currency: "EUR",
				status: "draft",
				tags: [],
				created_at: now(),
				variants: [{ id: `${id}_v1`, product_id: id, sku: sku ?? "", title: "Standaard", price: draft.price, inventory_level: 0 }],
				...draft,
			};
			set((s) => ({ createdProducts: [product, ...s.createdProducts] }));
			return product;
		},
		editProducts: (patches) =>
			set((s) => {
				const edits = { ...s.productEdits };
				for (const [id, patch] of Object.entries(patches)) edits[id] = { ...edits[id], ...patch };
				return { productEdits: edits };
			}),
		restoreProducts: (productEdits) => set({ productEdits }),
		toggleSupplierPause: (id) =>
			set((s) => ({
				pausedSuppliers: s.pausedSuppliers.includes(id) ? s.pausedSuppliers.filter((x) => x !== id) : [...s.pausedSuppliers, id],
			})),
		tagCustomers: (customers, tags, mode) =>
			set((s) => {
				const edits = { ...s.customerEdits };
				for (const c of customers) {
					const current = edits[c.id]?.tags ?? c.tags;
					const next = mode === "add" ? [...new Set([...current, ...tags])] : current.filter((t) => !tags.includes(t));
					edits[c.id] = { ...edits[c.id], tags: next };
				}
				return { customerEdits: edits };
			}),
		mergeCustomers: (keep, others) =>
			set((s) => {
				const edits = { ...s.customerEdits };
				const prior = edits[keep.id]?.absorbed ?? { ids: [], orders: 0, value: 0, emails: [] };
				const tags = new Set(edits[keep.id]?.tags ?? keep.tags);
				for (const o of others) {
					edits[o.id] = { ...edits[o.id], mergedInto: keep.id };
					for (const t of edits[o.id]?.tags ?? o.tags) tags.add(t);
				}
				edits[keep.id] = {
					...edits[keep.id],
					tags: [...tags],
					absorbed: {
						ids: [...prior.ids, ...others.map((o) => o.id)],
						orders: prior.orders + others.reduce((n, o) => n + o.orders_count, 0),
						value: prior.value + others.reduce((n, o) => n + o.lifetime_value, 0),
						emails: [...new Set([...prior.emails, ...others.map((o) => o.email).filter((e) => e !== keep.email)])],
					},
				};
				return { customerEdits: edits };
			}),
		syncToKlaviyo: (ids, list) =>
			set((s) => {
				const edits = { ...s.customerEdits };
				for (const id of ids) edits[id] = { ...edits[id], klaviyo: { list, at: now() } };
				return { customerEdits: edits };
			}),
		notDuplicate: (key) => set((s) => ({ notDuplicates: [...s.notDuplicates, key] })),
		restoreCustomers: (customerEdits, notDuplicates) => set({ customerEdits, notDuplicates }),
		removeOrder: (id) => set((s) => ({ orders: s.orders.filter((o) => o.id !== id) })),
		removeCustomer: (id) => set((s) => ({ createdCustomers: s.createdCustomers.filter((c) => c.id !== id) })),
		removeProduct: (id) => set((s) => ({ createdProducts: s.createdProducts.filter((p) => p.id !== id) })),

		/* ── tickets ───────────────────────────────────────────────────────────────────────── */

		createTicket: (draft) => {
			const next = Math.max(5100, ...get().tickets.map((t) => Number.parseInt(t.number.replace(/\D/g, ""), 10) || 0)) + 1;
			const ticket: Ticket = {
				id: `tkt_${next}`,
				number: `#${next}`,
				status: "intake",
				tags: [],
				assignee_ids: [],
				created_at: now(),
				updated_at: now(),
				...draft,
			};
			set((s) => ({ tickets: [ticket, ...s.tickets] }));
			return ticket;
		},
		setTicketStatus: (id, status) => {
			const before = get().tickets.find((t) => t.id === id)?.status;
			set((s) => ({ tickets: s.tickets.map((t) => (t.id === id ? { ...t, status, updated_at: now() } : t)) }));
			return before;
		},
		assignTicket: (id, memberId) =>
			set((s) => ({
				tickets: s.tickets.map((t) =>
					t.id === id ? { ...t, assignee_ids: t.assignee_ids.includes(memberId) ? t.assignee_ids : [...t.assignee_ids, memberId] } : t,
				),
			})),

		/* ── people ────────────────────────────────────────────────────────────────────────── */

		inviteMember: (email, role) => {
			const name = email
				.split("@")[0]
				?.split(/[._-]/)
				.filter(Boolean)
				.map((p) => p.charAt(0).toUpperCase() + p.slice(1))
				.join(" ");
			const member: Member = {
				id: `mem_${slug(email)}_${Date.now().toString(36)}`,
				user_id: "",
				name: name || email,
				email,
				role,
				status: "invited",
			};
			set((s) => ({ members: [...s.members, member] }));
			return member;
		},
		resendInvite: (id) => set((s) => ({ members: s.members.map((m) => (m.id === id ? { ...m, last_active_at: now() } : m)) })),
		setMemberRole: (id, role) => set((s) => ({ members: s.members.map((m) => (m.id === id ? { ...m, role } : m)) })),
		removeMember: (id) => {
			const index = get().members.findIndex((m) => m.id === id);
			const member = get().members[index];
			if (!member) return undefined;
			set((s) => ({ members: s.members.filter((m) => m.id !== id) }));
			return { member, index };
		},
		restoreMember: (member, index) =>
			set((s) => {
				const next = [...s.members];
				next.splice(index, 0, member);
				return { members: next };
			}),

		/* ── stores ────────────────────────────────────────────────────────────────────────── */

		connectStore: async (domain, name) => {
			const clean = domain.trim().toLowerCase();
			const full = clean.includes(".") ? clean : `${clean}.myshopify.com`;
			// Reconnecting a store the workspace already has keeps its id, so nothing that points at it breaks.
			const known = get().stores.find((st) => st.domain === full);
			const store: WorkspaceStore = {
				id: known?.id ?? `store_${slug(full)}`,
				name: name?.trim() || known?.name || titleFromDomain(full),
				domain: full,
				platform: "shopify",
				connected: false,
				status: "connecting",
				country: "NL",
				currency: "EUR",
				created_at: now(),
			};
			set((s) => ({
				stores: known ? s.stores.map((st) => (st.id === store.id ? store : st)) : [...s.stores, store],
			}));
			await wait(1600);
			patchStore(store.id, { status: "connected", connected: true });
			if (store.id === "store_uk") {
				set((s) => ({ queue: s.queue.map((q) => (q.id === "q_uk_unconnected" ? { ...q, state: "filed" } : q)) }));
			}
			return { ...store, status: "connected", connected: true };
		},
		reconnectStore: async (id) => {
			patchStore(id, { status: "connecting" });
			await wait(1400);
			patchStore(id, { status: "connected", connected: true });
			// The dashboard row that said this store was not connected is answered by connecting it.
			set((s) => ({
				queue: s.queue.map((q) => (q.id === "q_uk_unconnected" && id === "store_uk" ? { ...q, state: "filed" } : q)),
			}));
		},
		disconnectStore: (id) => patchStore(id, { status: "disconnected", connected: false }),
		setActiveStore: (id) => set({ activeStoreId: id }),

		/* ── integrations ──────────────────────────────────────────────────────────────────── */

		connectIntegration: async (key) => {
			patchIntegration(key, { status: "connecting" });
			await wait(1500);
			patchIntegration(key, { status: "connected", syncedAt: now() });
		},
		disconnectIntegration: (key) => patchIntegration(key, { status: "disconnected", syncedAt: undefined }),
		syncIntegration: async (key) => {
			patchIntegration(key, { status: "connecting" });
			await wait(1100);
			patchIntegration(key, { status: "connected", syncedAt: now() });
		},

		saveAccount: (account) => set({ account }),
	};
});

/* ── derived reads, so two screens never count the same thing two ways ───────────────────────── */

export { isDrawn, isNeedsYou, isOpen } from "../lib/queue-state";

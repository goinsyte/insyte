import { RecordAgentRows } from "../ask/agent-parts";
import { ProcessingTracker } from "./forwarding";
import { OrderReturns, StartReturnDialog } from "../returns/order-returns";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../../components/dropdown-menu";
import { getRouteApi } from "@tanstack/react-router";
import {
	Calendar,
	ChevronDown,
	Copy,
	CreditCard,
	Factory,
	Lock,
	Mail,
	MapPin,
	MessageSquare,
	Phone,
	Printer,
	RefreshCcw,
	RotateCcw,
	Sparkles,
	Truck,
	XCircle,
} from "../../icons";
import { useState } from "react";
import { toast } from "sonner";
import { useAskInsyte } from "../shell/ask-insyte-context";
import { ConfirmDialog } from "../common/confirm-dialog";
import { DetailShell } from "../common/detail-shell";
import { OrderTags } from "./order-tags";
import { ProductThumb } from "../product/product-thumb";
import { products as catalogue } from "../../data-source";

import { OrderStatusBadge } from "./order-status-badge";
import { formatCurrency, initials } from "../lib/format";
import { countryFlag, countryName } from "../lib/format-flag";
import type { Address, Order } from "../lib/types/domain";
import { undoable } from "../lib/undo";
import { useGate } from "../stores/access-store";
import { useWorkspace } from "../stores/workspace-store";
import { OrderNoteDialog, ShippingDialog } from "./order-dialogs";
import type { Currency } from "../lib/types/domain";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "../lib/utils";

const Route = getRouteApi("/_admin/orders/$orderId");

/** A line item's photograph, from the product it was sold as. */
const imageOf = (productId: string) => catalogue.find((p) => p.id === productId)?.images[0];

/** A line item's SKU, from the variant it was sold as. */
const skuOf = (variantId: string) => catalogue.flatMap((p) => p.variants).find((v) => v.id === variantId)?.sku;

const SUPPLIERS = [
	"Skyway Freight",
	"Oceanic Logistics",
	"City Couriers",
	"Delta Transport",
	"Express Carriers",
];

export function OrderDetailPage() {
	const { id, customer } = Route.useLoaderData();
	const order = useWorkspace((s) => s.orders.find((o) => o.id === id)) as Order;
	const refundOrder = useWorkspace((s) => s.refundOrder);
	const cancelOrder = useWorkspace((s) => s.cancelOrder);
	const restoreOrder = useWorkspace((s) => s.restoreOrder);
	const updateShipping = useWorkspace((s) => s.updateShipping);
	const addOrderNote = useWorkspace((s) => s.addOrderNote);
	const createTicket = useWorkspace((s) => s.createTicket);
	const navigate = useNavigate();
	const ask = useAskInsyte();
	const [cancelOpen, setCancelOpen] = useState(false);
	const [refundOpen, setRefundOpen] = useState(false);
	const [noteOpen, setNoteOpen] = useState(false);
	const [shippingOpen, setShippingOpen] = useState(false);
	const [adviceDismissed, setAdviceDismissed] = useState(false);
	const closed = order.status === "cancelled" || order.status === "refunded";
	const refundGate = useGate("refunds.write", order.total);
	const editGate = useGate("orders", 2);
	const returnsGate = useGate("returns", 2);
	const [returnOpen, setReturnOpen] = useState(false);

	function fulfil() {
		const before = order;
		useWorkspace.setState((s) => ({
			orders: s.orders.map((o) =>
				o.id === order.id
					? { ...o, status: "shipped", fulfillment_status: "fulfilled", updated_at: new Date().toISOString() }
					: o,
			),
		}));
		undoable(`${order.number} als afgehandeld gemarkeerd`, () => restoreOrder(before));
	}

	function draftSupplierMessage(supplier: string) {
		const ticket = createTicket({
			title: `Overdrachtsdatum bevestigen met ${supplier} voor ${order.number}`,
			description: `${supplier} verwerkt ${order.number} trager dan normaal. Vraag om de overdrachtsdatum en het track & trace-nummer en laat het ${order.customer_name} weten zodra je het hebt.`,
			priority: "high",
			related_entity: { type: "order", id: order.id, label: order.number },
		});
		setAdviceDismissed(true);
		toast.success(`Opgesteld als ${ticket.number}`, {
			description: "Controleer het voordat het naar de leverancier gaat.",
			action: { label: "Openen", onClick: () => navigate({ to: "/tickets", search: { ticket: ticket.id } }) },
		});
	}

	const status = order.tags.includes("at_risk")
		? ("delayed" as const)
		: order.status;
	const supplier =
		SUPPLIERS[Number.parseInt(order.id.slice(-2), 10) % SUPPLIERS.length];
	const country = order.shipping_address?.country ?? "US";

	const itemsSubtotal = order.line_items.reduce(
		(sum, li) => sum + li.unit_price * li.quantity,
		0,
	);
	const shipping = Math.round((order.total - itemsSubtotal) * 0.3 * 100) / 100;
	const tax = Math.max(0, order.total - itemsSubtotal - shipping);

	const timeline = buildTimeline(order);

	return (
		<DetailShell
			crumb={{ label: "Bestellingen", to: "/orders" }}
			title={order.number}
			badge={<OrderStatusBadge status={status} />}
			meta={
				<>
					{formatLong(order.created_at)} ·{" "}
					{formatCurrency(order.total, order.currency)} ·{" "}
					{order.line_items.length}{" "}
					{order.line_items.length === 1 ? "artikel" : "artikelen"}
				</>
			}
			actions={
				<>
					<button
						type="button"
						onClick={() => {
							navigator.clipboard?.writeText(order.number);
							toast.success("Bestelnummer gekopieerd");
						}}
						aria-label="Bestelnummer kopiëren"
						className="flex size-8 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink"
					>
						<Copy className="size-3.5" strokeWidth={1.75} />
					</button>
					<button
						type="button"
						onClick={() => ask.open()}
						className="flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-xs text-arc-ink transition-colors hover:bg-arc-tint"
					>
						<Sparkles className="size-3.5" strokeWidth={1.75} />
						Vraag Insyte
					</button>
					<button
						type="button"
						onClick={() => window.print()}
						className="flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-xs text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink"
					>
						<Printer className="size-3.5" strokeWidth={1.75} />
						Afdrukken
					</button>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								className="flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-xs text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink"
							>
								Acties
								<ChevronDown className="size-3.5" strokeWidth={1.75} />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-52">
							<DropdownMenuLabel>Bestelacties</DropdownMenuLabel>
							<DropdownMenuSeparator />
							<DropdownMenuItem disabled={closed || order.fulfillment_status === "fulfilled" || !editGate.ok} onClick={fulfil}>
								<Truck strokeWidth={1.75} />
								Als afgehandeld markeren
							</DropdownMenuItem>
							<DropdownMenuItem disabled={order.payment_status === "refunded" || !refundGate.ok} onClick={() => setRefundOpen(true)} className={refundGate.ok ? undefined : "h-auto py-1.5"}>
								{refundGate.ok ? <RefreshCcw strokeWidth={1.75} /> : <Lock strokeWidth={1.75} />}
								<span className="flex min-w-0 flex-col">
									Terugbetalen
									{refundGate.ok ? null : <span className="text-ink-3 text-xs leading-snug">{refundGate.reason}</span>}
								</span>
							</DropdownMenuItem>
							<DropdownMenuItem disabled={!editGate.ok} onClick={() => setNoteOpen(true)}>
								<MessageSquare strokeWidth={1.75} />
								Interne notitie toevoegen
							</DropdownMenuItem>
							<DropdownMenuItem disabled={!returnsGate.ok} onClick={() => setReturnOpen(true)}>
								<RotateCcw strokeWidth={1.75} />
								Retour starten
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								variant="destructive"
								disabled={closed || !editGate.ok}
								onClick={() => setCancelOpen(true)}
							>
								<XCircle strokeWidth={1.75} />
								Bestelling annuleren
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</>
			}
		>
			<div className="flex flex-col gap-4">
			{/* AI Recommendation — mesh-dark, the brand's voice when AI speaks. */}
			{!adviceDismissed && !closed && (status === "delayed" || order.tags.includes("at_risk")) ? (
				<section className="flex w-full items-start justify-between gap-4 rounded-xl bg-abyss p-5 text-mesh-ink">
					<div className="flex flex-col gap-2">
						<div className="flex items-center gap-2.5">
							<span className="flex size-5 items-center justify-center rounded-md bg-mesh-ink/10 ">
								<Sparkles
									className="size-3 text-mesh-ink"
									strokeWidth={2}
								/>
							</span>
							<span
								className="font-medium text-sm text-mesh-ink leading-none"
							>
								Insyte AI
							</span>
							<span className="font-medium text-2xs text-mesh-ink/30 leading-none">·</span>
							<span
								className="font-medium text-sm text-mesh-ink/70 leading-none"
							>
								Aanbeveling
							</span>
						</div>
						<p className="max-w-[64ch] text-base text-mesh-ink/85 leading-[1.55]">
							<span className="font-medium text-mesh-ink">
								De leverancier verwerkt deze bestelling trager dan normaal.
							</span>{" "}
							Vraag {supplier} om de verwachte overdrachtsdatum.
						</p>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						<button
							type="button"
							onClick={() => setAdviceDismissed(true)}
							className="flex h-9 items-center justify-center rounded-md px-3 font-medium text-base text-mesh-ink/70 leading-none tracking-[-0.05px] transition-colors hover:bg-mesh-ink/8 hover:text-mesh-ink"
						>
							Negeren
						</button>
						<button
							type="button"
							onClick={() => draftSupplierMessage(supplier ?? "de leverancier")}
							className="flex h-9 items-center justify-center rounded-md bg-paper px-3.5 font-medium text-base text-ink leading-none tracking-[-0.05px] shadow-on-mesh transition-colors hover:bg-arc-tint"
						>
							Bericht opstellen
						</button>
					</div>
				</section>
			) : null}

			{/* Body: 2-col layout */}
			<div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
				<div className="flex flex-col gap-5">
					<ProcessingTracker order={order} />
					{/* Line items */}
					<section className="overflow-hidden rounded-xl panel">
						<header className="flex items-center justify-between px-5 pt-4 pb-1">
							<h2 className="font-medium text-md text-ink">
								Artikelen
							</h2>
							<span className="font-medium text-sm text-ink-3 leading-[1.2]">
								{order.line_items.length}{" "}
								{order.line_items.length === 1 ? "artikel" : "artikelen"}
							</span>
						</header>
						<ul>
							{order.line_items.map((li) => (
								<li
									key={li.id}
									className="flex items-center gap-3 px-5 py-2.5"
								>
									<ProductThumb src={imageOf(li.product_id)} title={li.title} size={48} className="rounded-lg" />
									<div className="min-w-0 flex-1">
										<p className="truncate font-medium text-base text-ink leading-[1.4]">
											{li.title}
										</p>
										<p className="truncate font-normal text-sm text-ink-3 leading-[1.4]">
											SKU {li.variant_id ? (skuOf(li.variant_id) ?? li.variant_id) : li.product_id} · Aantal {li.quantity}
											{li.variant_title ? ` · ${li.variant_title}` : ""}
										</p>
									</div>
									<span className="shrink-0 font-medium text-base text-ink leading-[1.2]">
										{formatCurrency(
											li.unit_price * li.quantity,
											order.currency,
										)}
									</span>
								</li>
							))}
						</ul>
						{/* Totals */}
						<div className="mt-2 bg-mist px-5 py-4">
							<TotalsRow
								label="Subtotaal"
								value={itemsSubtotal}
								currency={order.currency}
							/>
							<TotalsRow
								label="Verzending"
								value={shipping}
								currency={order.currency}
							/>
							<TotalsRow label="Btw" value={tax} currency={order.currency} />
							<div className="mt-2 border-hairline border-t pt-2">
								<TotalsRow
									label="Totaal"
									value={order.total}
									currency={order.currency}
									bold
								/>
							</div>
						</div>
					</section>

					{/* Timeline */}
					<section className="overflow-hidden rounded-xl panel">
						<header className="flex items-center justify-between px-5 pt-4 pb-1">
							<h2 className="font-medium text-md text-ink">
								Tijdlijn
							</h2>
						</header>
						<ol className="flex flex-col px-5 py-4">
							{timeline.map((t, i) => (
								<li key={t.label} className="flex gap-3 pb-4 last:pb-0">
									<div className="flex shrink-0 flex-col items-center">
										<span
											className={cn(
												"flex size-6 items-center justify-center rounded-full",
												t.done ? "bg-abyss text-mesh-ink" : "bg-mist text-ink-3",
											)}
										>
											<t.icon className="size-3.5" strokeWidth={2} />
										</span>
										{i < timeline.length - 1 ? (
											<span
												className={cn(
													"w-px flex-1",
													t.done ? "bg-abyss/40" : "bg-hairline",
												)}
											/>
										) : null}
									</div>
									<div className="flex flex-1 flex-col pb-3">
										<p className="font-medium text-base text-ink leading-[1.4]">
											{t.label}
										</p>
										<p className="font-normal text-sm text-ink-3 leading-[1.4]">
											{t.detail}
										</p>
									</div>
								</li>
							))}
						</ol>
						<div className="px-5 pb-4">
							<RecordAgentRows kind="order" id={order.id} />
						</div>
					</section>
				</div>

				{/* Sidebar */}
				<StartReturnDialog order={order} open={returnOpen} onClose={() => setReturnOpen(false)} />
				<aside className="flex flex-col gap-5">
					{/* Customer */}
					<section className="flex flex-col gap-3 rounded-xl panel p-5">
						<h3 className="font-normal text-base text-ink-2 leading-[1.55]">
							Klant
						</h3>
						<div className="flex items-center gap-3">
							<span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-arc font-medium text-base text-mesh-ink">
								{initials(order.customer_name)}
							</span>
							<div className="min-w-0">
								<p className="truncate font-medium text-base text-ink leading-[1.4]">
									{order.customer_name}
								</p>
								<p className="truncate font-normal text-sm text-ink-3 leading-[1.4]">
									{customer
										? `${customer.orders_count} ${customer.orders_count === 1 ? "bestelling" : "bestellingen"} · ${formatCurrency(customer.lifetime_value)} CLV`
										: "Gastbestelling"}
								</p>
							</div>
						</div>
						<div className="flex flex-col gap-2 border-hairline border-t pt-3">
							<SidebarLine icon={Mail} text={order.customer_email} />
							{customer?.phone ? (
								<SidebarLine icon={Phone} text={customer.phone} />
							) : null}
						</div>
					</section>

					{/* Shipping */}
					<section className="flex flex-col gap-3 rounded-xl panel p-5">
						<div className="flex items-center justify-between">
							<h3 className="font-normal text-base text-ink-2 leading-[1.55]">
								Verzending
							</h3>
							<button
								type="button"
								onClick={() => setShippingOpen(true)}
								className="font-medium text-sm text-arc-ink leading-[1.2] hover:underline"
							>
								Bewerken
							</button>
						</div>
						<div className="flex items-start gap-2">
							<span className="mt-0.5 text-base leading-none">
								{countryFlag(country)}
							</span>
							<div className="flex flex-col">
								<p className="font-medium text-base text-ink leading-[1.4]">
									{order.customer_name}
								</p>
								<p className="font-normal text-sm text-ink-3 leading-[1.6]">
									{order.shipping_address?.line1 ?? "120 Main St"}
									<br />
									{order.shipping_address?.city ?? "Brooklyn"},{" "}
									{order.shipping_address?.region ?? "NY"}{" "}
									{order.shipping_address?.postal_code ?? "11201"}
									<br />
									{countryName(country)}
								</p>
							</div>
						</div>
						<SidebarLine icon={Truck} text={supplier} />
					</section>

					{/* Payment */}
					<section className="flex flex-col gap-3 rounded-xl panel p-5">
						<h3 className="font-normal text-base text-ink-2 leading-[1.55]">
							Betaling
						</h3>
						<SidebarLine
							icon={CreditCard}
							text={`${PAYMENT_STATUS_LABEL[order.payment_status] ?? order.payment_status} · ${paymentMethodLabel()}`}
						/>
						<SidebarLine
							icon={Calendar}
							text={`Geïnd op ${formatLong(order.created_at)}`}
						/>
					</section>

					{order.notes ? (
						<section className="flex flex-col gap-2 rounded-xl bg-signal-amber-bg/60 p-5">
							<div className="flex items-center justify-between">
								<h3 className="font-medium text-sm text-ink-2">Interne notitie</h3>
								<button
									type="button"
									onClick={() => setNoteOpen(true)}
									className="font-medium text-sm text-arc-ink hover:underline"
								>
									Bewerken
								</button>
							</div>
							<p className="whitespace-pre-line text-base text-ink">{order.notes}</p>
						</section>
					) : null}

					<OrderTags order={order} />
					<OrderReturns order={order} onStart={() => setReturnOpen(true)} />
				</aside>
			</div>
			<ConfirmDialog
				open={cancelOpen}
				onOpenChange={setCancelOpen}
				title={`Bestelling ${order.number} annuleren?`}
				description="Dit stopt de afhandeling, geeft gereserveerde voorraad vrij en laat het de klant weten. Zodra de leverancier het bevestigt, kun je dit in Insyte niet meer terugdraaien."
				confirmLabel="Bestelling annuleren"
				cancelLabel="Bestelling houden"
				tone="destructive"
				onConfirm={() => {
					const before = cancelOrder(order.id);
					setCancelOpen(false);
					if (before) undoable(`${order.number} geannuleerd`, () => restoreOrder(before), "De afhandeling is gestopt en de klant is op de hoogte.");
				}}
			/>
			<ConfirmDialog
				open={refundOpen}
				onOpenChange={setRefundOpen}
				title={`${formatCurrency(order.total, order.currency)} terugbetalen aan ${order.customer_name}?`}
				description="Het geld gaat terug via de oorspronkelijke betaalmethode, meestal binnen vijf werkdagen. Een verstuurde terugbetaling kun je niet terughalen."
				confirmLabel="Volledig terugbetalen"
				onConfirm={() => {
					refundOrder(order.id);
					setRefundOpen(false);
					toast.success(`${order.number} terugbetaald`, {
						description: `${formatCurrency(order.total, order.currency)} aan ${order.customer_name}`,
					});
				}}
			/>
			<OrderNoteDialog
				open={noteOpen}
				onOpenChange={setNoteOpen}
				initial={order.notes ?? ""}
				onSave={(note) => {
					addOrderNote(order.id, note);
					toast.success("Notitie opgeslagen");
				}}
			/>
			<ShippingDialog
				open={shippingOpen}
				onOpenChange={setShippingOpen}
				name={order.customer_name}
				initial={order.shipping_address}
				onSave={(address: Address) => {
					const before = order;
					updateShipping(order.id, address);
					undoable("Verzendadres bijgewerkt", () => restoreOrder(before));
				}}
			/>
			</div>
		</DetailShell>
	);
}

function TotalsRow({
	label,
	value,
	currency,
	bold,
}: {
	label: string;
	value: number;
	currency?: Currency;
	bold?: boolean;
}) {
	return (
		<div className="flex items-center justify-between py-1">
			<span
				className={cn(
					"text-base leading-[1.4]",
					bold ? "font-medium text-ink" : "font-medium text-ink-3",
				)}
			>
				{label}
			</span>
			<span
				className={cn(
					"text-base leading-[1.4]",
					bold ? "font-medium text-ink" : "font-normal text-ink",
				)}
			>
				{formatCurrency(value, currency)}
			</span>
		</div>
	);
}

function SidebarLine({
	icon: Icon,
	text,
}: {
	icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
	text: string;
}) {
	return (
		<div className="flex items-center gap-2">
			<Icon className="size-4 text-ink-3" strokeWidth={1.75} />
			<span className="truncate font-normal text-sm text-ink leading-[1.4]">
				{text}
			</span>
		</div>
	);
}

function buildTimeline(order: {
	created_at: string;
	status: string;
	tags: string[];
	carrier?: string;
	tracking_number?: string;
}) {
	const placed = {
		done: true,
		label: "Bestelling geplaatst",
		detail: formatLong(order.created_at),
		icon: Calendar,
	};
	const paid = {
		done: true,
		label: "Betaling geïnd",
		detail: "Stripe",
		icon: CreditCard,
	};
	const atSupplier = {
		done: ["at_supplier", "shipped", "delivered"].includes(order.status),
		label: "Bij leverancier",
		detail: "Bestelling geaccepteerd door leverancier",
		icon: Factory,
	};
	const shipped = {
		done: ["shipped", "delivered"].includes(order.status),
		label: "Verzonden",
		detail: order.tracking_number ? `${order.carrier ?? "Vervoerder"} · ${order.tracking_number}` : "Opgehaald door vervoerder",
		icon: Truck,
	};
	const delivered = {
		done: order.status === "delivered",
		label: "Bezorgd",
		detail: order.status === "delivered" ? "Bevestigd" : "In afwachting",
		icon: MapPin,
	};
	if (order.status === "cancelled" || order.status === "refunded") {
		const terminal = {
			done: true,
			label: order.status === "cancelled" ? "Geannuleerd" : "Terugbetaald",
			detail: "Door beheerder",
			icon: XCircle,
		};
		return [placed, paid, terminal];
	}
	return [placed, paid, atSupplier, shipped, delivered];
}

const PAYMENT_STATUS_LABEL: Record<string, string> = {
	pending: "In afwachting",
	paid: "Betaald",
	refunded: "Terugbetaald",
	voided: "Vervallen",
};

function paymentMethodLabel(m?: string): string {
	if (!m) return "Stripe";
	if (m === "stripe") return "Stripe · Visa eindigend op 4242";
	if (m === "paypal") return "PayPal";
	if (m === "klarna") return "Klarna";
	return m;
}

function formatLong(iso: string): string {
	return new Intl.DateTimeFormat("nl-NL", {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(new Date(iso));
}

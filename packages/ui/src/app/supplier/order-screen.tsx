import { Link, getRouteApi } from "@tanstack/react-router";
import { AlertTriangle, Check, FileText, MessagesSquare, Package, Truck } from "../../icons";
import { useState } from "react";
import { PageHeader } from "../common/page-header";
import { downloadPackingSlips } from "./packing-slip";
import { ProblemDialog } from "./problem-dialog";
import { ShipDialog } from "./ship-dialog";
import { SupplierStatusChip } from "./status";
import { useSupplierOrders } from "../hooks/use-supplier-orders";
import { formatCurrency } from "../lib/format";
import { countryFlag, countryName } from "../lib/format-flag";
import { ME_SUPPLIER, PROBLEM_LABEL } from "../lib/supplier-work";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import { useWorkspace } from "../stores/workspace-store";

const Route = getRouteApi("/_supplier/supplier/orders/$orderId");

const when = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
const short = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/*
 * One order, from the supplier's side: its own lines and what they are worth to it, the address
 * the parcel goes to (and nothing else about the customer), when Northwind expects it handed over,
 * the parcels already sent and what happened. The actions are the supplier's only: accept, ship,
 * packing slip, report a problem, talk to Northwind about it.
 */
export function SupplierOrder() {
	const { id } = Route.useLoaderData();
	const row = useSupplierOrders().find((r) => r.id === id);
	const accept = useWorkspace((s) => s.acceptSupplierOrders);
	const snapshot = useWorkspace((s) => s.supplierSnapshot);
	const restore = useWorkspace((s) => s.restoreSupplier);
	const [shipping, setShipping] = useState(false);
	const [problem, setProblem] = useState(false);
	if (!row) return null;
	const a = row.order.shipping_address;
	const open = row.status === "to_accept" || row.status === "to_ship" || row.status === "problem";

	const events = [
		{ at: row.order.created_at, label: "Bestelling geplaatst bij Northwind", tone: "ink" },
		...(row.work?.accepted_at ? [{ at: row.work.accepted_at, label: "Door jou geaccepteerd", tone: "ink" }] : []),
		...(row.work?.problem ? [{ at: row.work.problem.at, label: `Probleem gemeld: ${PROBLEM_LABEL[row.work.problem.kind].toLowerCase()}`, tone: "amber" }] : []),
		...(row.work?.parcels ?? []).map((p) => ({ at: p.at, label: `Verzonden met ${p.carrier} · ${p.tracking}`, tone: "green" })),
	].sort((x, y) => x.at.localeCompare(y.at));

	return (
		<div className="flex min-w-0 flex-col">
			<PageHeader
				title={row.number}
				crumbs={[{ label: "Bestellingen", to: "/supplier/orders" }]}
				meta={<SupplierStatusChip status={row.status} />}
				actions={
					<div className="flex items-center gap-1.5">
						<button
							type="button"
							onClick={() => downloadPackingSlips([row], "Northwind Clothing Co.")}
							className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-mist px-3 font-medium text-ink text-sm hover:bg-ink/8"
						>
							<FileText className="size-3.5" strokeWidth={1.75} />
							Pakbon
						</button>
						{open ? (
							<button
								type="button"
								onClick={() => setProblem(true)}
								className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-mist px-3 font-medium text-ink text-sm hover:bg-ink/8"
							>
								<AlertTriangle className="size-3.5" strokeWidth={1.75} />
								Probleem melden
							</button>
						) : null}
						{row.status === "to_accept" ? (
							<button
								type="button"
								onClick={() => {
									const before = snapshot();
									accept(ME_SUPPLIER.id, [row.id]);
									undoable(`${row.number} geaccepteerd`, () => restore(before));
								}}
								className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-mesh-ink text-sm shadow-primary hover:bg-abyss-2"
							>
								<Check className="size-3.5" strokeWidth={2} />
								Accepteren
							</button>
						) : open ? (
							<button
								type="button"
								onClick={() => setShipping(true)}
								className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-mesh-ink text-sm shadow-primary hover:bg-abyss-2"
							>
								<Truck className="size-3.5" strokeWidth={1.75} />
								Markeren als verzonden
							</button>
						) : null}
					</div>
				}
			/>

			<div className="grid gap-8 px-5 pt-2 pb-10 lg:grid-cols-[minmax(0,1fr)_320px]">
				<div className="flex min-w-0 flex-col gap-8">
					{row.work?.problem ? (
						<p className="flex items-start gap-2.5 rounded-lg bg-signal-amber-bg px-4 py-3 text-ink text-sm">
							<AlertTriangle className="mt-0.5 size-4 shrink-0 text-signal-amber" strokeWidth={1.75} />
							<span>
								<span className="font-medium">{PROBLEM_LABEL[row.work.problem.kind]}.</span> {row.work.problem.note} Northwind heeft er een ticket van en ziet de
								bestelling als vertraagd.
							</span>
						</p>
					) : null}

					<section aria-labelledby="lines-title" className="flex flex-col gap-2">
						<h2 id="lines-title" className="font-medium text-ink text-lg">
							Jouw artikelen
						</h2>
						<ul className="flex flex-col">
							{row.lines.map((l) => (
								<li key={l.id} className="flex items-center gap-3 py-2.5 shadow-[inset_0_-1px_0_color-mix(in_oklch,var(--ink)_7%,transparent)]">
									<span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-mist text-ink-3">
										<Package className="size-4" strokeWidth={1.75} />
									</span>
									<span className="flex min-w-0 flex-1 flex-col">
										<span className="truncate font-medium text-base text-ink">{l.title}</span>
										<span className="text-ink-3 text-sm">
											{l.variant_title ? `${l.variant_title} · ` : ""}
											{l.variant_id}
										</span>
									</span>
									<span className="font-medium text-base text-ink tabular-nums">{l.quantity}×</span>
								</li>
							))}
						</ul>
						<p className="flex justify-between text-ink-2 text-sm">
							<span>Wat Northwind je hiervoor betaalt</span>
							<span className="font-medium text-ink tabular-nums">{formatCurrency(row.amount)}</span>
						</p>
					</section>

					<section aria-labelledby="parcels-title" className="flex flex-col gap-2">
						<h2 id="parcels-title" className="font-medium text-ink text-lg">
							Pakketten
						</h2>
						{(row.work?.parcels ?? []).length === 0 ? (
							<p className="text-ink-3 text-sm">
								{row.status === "shipped" ? `Verzonden${row.order.tracking_number ? ` met ${row.order.carrier ?? "de vervoerder"} · ${row.order.tracking_number}` : ""}.` : "Nog niets verzonden."}
							</p>
						) : (
							<ul className="flex flex-col gap-1">
								{row.work!.parcels.map((p) => (
									<li key={p.id} className="flex items-center gap-3 rounded-lg bg-mist px-3 py-2.5 text-sm">
										<Truck className="size-4 shrink-0 text-ink-3" strokeWidth={1.75} />
										<span className="font-medium text-ink">{p.carrier}</span>
										<span className="text-ink-2 tabular-nums">{p.tracking}</span>
										<span className="ml-auto text-ink-3 tabular-nums">{short.format(new Date(p.at))}</span>
									</li>
								))}
							</ul>
						)}
					</section>

					<section aria-labelledby="events-title" className="flex flex-col gap-2">
						<h2 id="events-title" className="font-medium text-ink text-lg">
							Wat er gebeurde
						</h2>
						<ol className="flex flex-col gap-2.5">
							{events.map((e) => (
								<li key={`${e.at}${e.label}`} className="flex items-center gap-3 text-sm">
									<span
										aria-hidden
										className={cn("size-2 shrink-0 rounded-full", e.tone === "green" ? "bg-signal-green" : e.tone === "amber" ? "bg-signal-amber" : "bg-ink-4")}
									/>
									<span className="text-ink">{e.label}</span>
									<span className="ml-auto text-ink-3 tabular-nums">{short.format(new Date(e.at))}</span>
								</li>
							))}
						</ol>
					</section>
				</div>

				<aside className="flex flex-col gap-6">
					{open ? (
						<section className="flex flex-col gap-1.5">
							<h2 className="font-medium text-ink-3 text-sm">Overdragen aan de vervoerder vóór</h2>
							<p className="flex flex-wrap items-center gap-2 font-medium text-base text-ink">
								<span className="first-letter:uppercase">{when.format(row.handoff)}</span>
								{row.due === "late" ? (
									<span className="rounded-sm bg-signal-red-bg px-1.5 py-0.5 font-medium text-signal-red text-xs">Te laat</span>
								) : row.due === "today" ? (
									<span className="rounded-sm bg-signal-amber-bg px-1.5 py-0.5 font-medium text-signal-amber text-xs">Vandaag</span>
								) : null}
							</p>
						</section>
					) : null}
					<section className="flex flex-col gap-1.5">
						<h2 className="font-medium text-ink-3 text-sm">Verzendadres</h2>
						<address className="text-base text-ink not-italic leading-relaxed">
							{row.order.customer_name}
							<br />
							{a?.line1}
							{a?.line2 ? (
								<>
									<br />
									{a.line2}
								</>
							) : null}
							<br />
							{a?.postal_code} {a?.city}
							<br />
							{countryFlag(a?.country ?? "")} {countryName(a?.country ?? "")}
						</address>
						<p className="text-ink-3 text-xs">E-mail en telefoon van de klant blijven bij Northwind.</p>
					</section>
					{row.order.notes ? (
						<section className="flex flex-col gap-1.5">
							<h2 className="font-medium text-ink-3 text-sm">Notitie van Northwind</h2>
							<p className="text-base text-ink">{row.order.notes}</p>
						</section>
					) : null}
					<Link
						to="/supplier/chats"
						search={{ ref: row.number } as never}
						className="flex h-9 items-center gap-2 self-start rounded-md px-3 font-medium text-arc-ink text-sm hover:bg-arc-tint"
					>
						<MessagesSquare className="size-4" strokeWidth={1.75} />
						Northwind iets vragen over {row.number}
					</Link>
				</aside>
			</div>

			<ShipDialog rows={[row]} open={shipping} onOpenChange={setShipping} />
			<ProblemDialog row={row} open={problem} onOpenChange={setProblem} />
		</div>
	);
}

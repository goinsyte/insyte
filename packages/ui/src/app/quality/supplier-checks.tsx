import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ClipboardCheck } from "../../icons";
import { ME_SUPPLIER } from "../lib/supplier-work";
import { CHECK_KIND_LABEL, checkOverdue } from "../lib/quality";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import { products } from "../../data-source";
import { useQuality } from "../stores/quality-store";
import { CheckCard } from "./check-card";

/*
 * The supplier's side of a quality check (PLAN 26): what Northwind asked for, with the date, and a
 * well to drop the photos and video in, the batch number and a note, then Controle insturen. A
 * rejected check shows why and can be sent again. Suppliers only ever see their own products' checks.
 */

export function SupplierChecks({ productId }: { productId: string }) {
	const all = useQuality((s) => s.checks);
	const checks = useMemo(() => all.filter((c) => c.productId === productId && c.supplierId === ME_SUPPLIER.id).toSorted((a, b) => b.requestedAt.localeCompare(a.requestedAt)), [all, productId]);
	if (checks.length === 0) return null;
	return (
		<section aria-labelledby="checks-title" className="flex flex-col gap-3">
			<h2 id="checks-title" className="font-medium text-ink text-lg">
				Kwaliteitscontroles
			</h2>
			<ul className="flex flex-col gap-3">
				{checks.map((c) => (
					<li key={c.id}>
						<CheckCard c={c} brand="Northwind" send={async (a) => {
							const undo = useQuality.getState().submit(c.id, { at: new Date().toISOString(), by: "Marco Rossi", photos: a.files.filter((f) => !f.type.startsWith("video/")).map((f) => URL.createObjectURL(f)), video: a.files.some((f) => f.type.startsWith("video/")), batch: a.batch, note: a.note });
							undoable("Controle ingestuurd", undo, "Northwind krijgt een melding en beoordeelt het.");
							return null;
						}} />
					</li>
				))}
			</ul>
		</section>
	);
}

/** The supplier start's "Eerst dit": open checks, before the orders, oldest date first. */
export function SupplierCheckWork() {
	const all = useQuality((s) => s.checks);
	const open = useMemo(() => all.filter((c) => c.supplierId === ME_SUPPLIER.id && (c.status === "requested" || c.status === "rejected")).toSorted((a, b) => a.due.localeCompare(b.due)), [all]);
	if (open.length === 0) return null;
	return (
		<ul className="flex flex-col">
			{open.map((c) => (
				<li key={c.id} className="shadow-[inset_0_-1px_0_color-mix(in_oklch,var(--ink)_7%,transparent)]">
					<Link to="/supplier/products/$productId" params={{ productId: c.productId }} className="group flex items-center gap-4 py-3">
						<ClipboardCheck className="size-4 shrink-0 text-ink-3" strokeWidth={1.75} />
						<span className="min-w-0 flex-1 truncate text-sm">
							<span className="font-medium text-ink group-hover:text-arc-ink">{CHECK_KIND_LABEL[c.kind]}</span>
							<span className="text-ink-2"> · {products.find((p) => p.id === c.productId)?.title ?? c.productId}</span>
						</span>
						<span className={cn("shrink-0 rounded-sm px-1.5 py-0.5 font-medium text-xs", checkOverdue(c, Date.now()) ? "bg-signal-red-bg text-signal-red" : c.status === "rejected" ? "bg-signal-red-bg text-signal-red" : "bg-arc-tint text-arc-ink")}>
							{checkOverdue(c, Date.now()) ? "Te laat" : c.status === "rejected" ? "Opnieuw insturen" : `Vóór ${new Intl.DateTimeFormat("nl-NL", { weekday: "short" }).format(new Date(c.due))}`}
						</span>
					</Link>
				</li>
			))}
		</ul>
	);
}
